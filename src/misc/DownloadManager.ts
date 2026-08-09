import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Mutex } from "../utils/index.js";
import { getConfig } from '../config.js';
import { DownloadFinishResult, VideoInfo } from "ytdlp-nodejs";
import { YTDLP, logger, sanitizeString } from "../utils/index.js";

const config = getConfig();
export const downloadsDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER);
export const videoCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "video");
export const audioCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "audio");
const dbPath = path.join(process.cwd(), config.DOWNLOADS_FOLDER, 'cache.db');

// open the database
const db = new Database(dbPath, { verbose: (msg) => logger.debug(msg, 'Database') });
db.exec('CREATE TABLE IF NOT EXISTS audio (hash TEXT, path TEXT, filename TEXT, size INTEGER, date INTEGER, videoData TEXT, reads INTEGER, PRIMARY KEY(hash))');
db.exec('CREATE TABLE IF NOT EXISTS video (hash TEXT, path TEXT, filename TEXT, size INTEGER, date INTEGER, videoData TEXT, reads INTEGER, PRIMARY KEY(hash))');
db.exec('CREATE INDEX IF NOT EXISTS idx_audio_date ON audio(date)');
db.exec('CREATE INDEX IF NOT EXISTS idx_video_date ON video(date)');
interface CacheEntry {
    path: string;
    filename: string;
    size: number;
    date: number;
    reads: number;
    videoData: VideoInfo;
}
type CacheEntryWithHash = CacheEntry & {
    hash: string;
};
type DatabaseCacheEntry = Omit<CacheEntryWithHash, 'videoData'> & {
    videoData: string; 
};
interface DownloadResult {
    path: string;
    filename: string;
    size: number;
    date: number;
    videoData: VideoInfo;
}
const insertAudio = db.prepare< [string, string, string, number, number, string, number], void >('INSERT OR REPLACE INTO audio (hash, path, filename, size, date, videoData, reads) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertVideo = db.prepare< [string, string, string, number, number, string, number], void >('INSERT OR REPLACE INTO video (hash, path, filename, size, date, videoData, reads) VALUES (?, ?, ?, ?, ?, ?, ?)');
const getAudio = db.prepare<string, DatabaseCacheEntry | null >('SELECT * FROM audio WHERE hash = ?');
const getVideo = db.prepare<string, DatabaseCacheEntry | null >('SELECT * FROM video WHERE hash = ?');
const getAllAudio = db.prepare<[], DatabaseCacheEntry>('SELECT * FROM audio');
const getAllVideo = db.prepare<[], DatabaseCacheEntry>('SELECT * FROM video');
const getTotalSizeAudio = db.prepare<unknown[], { totalSize: number | null }>('SELECT SUM(size) as totalSize FROM audio');
const getTotalSizeVideo = db.prepare<unknown[], { totalSize: number | null }>('SELECT SUM(size) as totalSize FROM video');
const getOldestAudio = db.prepare<number, DatabaseCacheEntry | null >('SELECT * FROM audio WHERE date < ? ORDER BY date ASC LIMIT 1');
const getOldestVideo = db.prepare<number, DatabaseCacheEntry | null >('SELECT * FROM video WHERE date < ? ORDER BY date ASC LIMIT 1');
const deleteAudio = db.prepare<string>('DELETE FROM audio WHERE hash = ?');
const deleteVideo = db.prepare<string>('DELETE FROM video WHERE hash = ?');
class Cache {

    set(hash: string, type: "video" | "audio", value: CacheEntry | CacheEntryWithHash): this {
        switch (type) {
            case "video":
                insertVideo.run(hash, value.path, value.filename, value.size, value.date, JSON.stringify(value.videoData), value.reads);
                break;
            case "audio":
                insertAudio.run(hash, value.path, value.filename, value.size, value.date, JSON.stringify(value.videoData), value.reads);
                break;
        }
        return this;
    }
    get(hash: string, type: "video" | "audio"): CacheEntryWithHash | null {
        switch (type) {
            case "video":
                const videoEntry = getVideo.get(hash);
                return videoEntry ? { ...videoEntry, videoData: JSON.parse(videoEntry.videoData) } : null;
            case "audio":
                const audioEntry = getAudio.get(hash);
                return audioEntry ? { ...audioEntry, videoData: JSON.parse(audioEntry.videoData) } : null;
            default:
                return null;
        }
    }
    getAll(type: "video" | "audio"): CacheEntryWithHash[] {
        let entries: DatabaseCacheEntry[];
        switch (type) {
            case "video":
                entries = getAllVideo.all();
                break;
            case "audio":
                entries = getAllAudio.all();
                break;
            default:
                entries = [];
        }
        return entries.map((entry) => ({ ...entry, videoData: JSON.parse(entry.videoData) }));
    }
    getTotalSize(type: "video" | "audio"): number {
        const row = type === "video"
            ? getTotalSizeVideo.get()
            : getTotalSizeAudio.get();

        return row?.totalSize ?? 0;
    }
    getOldest(type: "video" | "audio", minAgeMs: number): CacheEntryWithHash | null {
        const cutoffDate = Date.now() - minAgeMs;
        const evictable = type === "video" ? getOldestVideo.get(cutoffDate) : getOldestAudio.get(cutoffDate);
        return evictable ? { ...evictable, videoData: JSON.parse(evictable.videoData) } : null;
    }
    delete(hash: string, type: "video" | "audio"): boolean {
        switch (type) {
            case "video":
                const deleteResult = deleteVideo.run(hash);

                return deleteResult.changes > 0 ? true : false;
            case "audio":
                const result = deleteAudio.run(hash);
                return result.changes > 0 ? true : false;
            default:
                return false;
        }
    }


}


class DownloadManager {
    private maxVideoCacheSizeMB = 1000;
    private maxAudioCacheSizeMB = 3000;
    private minCacheAgeMs = 60 * 60 * 1000; // 1 hour
    private downloadMutex = new Mutex();
    // Stores resolved cache entries
    private cache = new Cache();
    private ytdlp = new YTDLP()
    /**
     * Public entry point. Returns path to cached file if available, otherwise downloads it.
     * @param {VideoInfo} info - The video information.
     * @param {"video" | "audio"} type - Audioonly or video.
     * @param {boolean} forceDownload - If true, forces a re-download even if the file is cached.
     */
    async download(info: VideoInfo, type: "video" | "audio" = "video", forceDownload: boolean = false): Promise<DownloadResult | null> {
        logger.debug(`Downloading ${info.webpage_url}`);
        const unlock = await this.downloadMutex.lock();
        try {
            const cacheEntry = await this.getCacheEntry(info.id, type);
            if (cacheEntry && !forceDownload) {
                logger.info(`Cache hit for ${info.webpage_url}, returning cached file.`);
                return { path: cacheEntry.path, filename: cacheEntry.filename, size: cacheEntry.size, date: cacheEntry.date, videoData: cacheEntry.videoData };
            }
            const result = await this.executeDownload(info, type);
            if (!result) {
                logger.error(`Download failed for ${info.webpage_url}`);
                return null;
            }
            await this.saveCacheEntry(info.id, type, { ...result, reads: 0 });
            logger.debug(`Download complete for ${info.webpage_url}, result: ${JSON.stringify(result)}`);
            return result;
        } catch (e) {
            logger.error(e, `Error in download manager for ${info.webpage_url}`);
            return null;
        } finally {
            unlock();
        }
    }
    private async saveCacheEntry(videoID: string, type: "video" | "audio", entry: CacheEntry): Promise<void> {
        const cacheKey = crypto.createHash("md5").update(videoID).digest("hex");
        await this.cache.set(cacheKey, type, entry);
        await this.enforceCacheSizeLimit(type);
    }
    public async getCacheEntry(videoID: string, type: "video" | "audio"): Promise<CacheEntry | null> {
        const cacheKey = crypto.createHash("md5").update(videoID).digest("hex");
        const cached = await this.cache.get(cacheKey, type);
        if (cached) {
            cached.reads += 1;
            cached.date = Date.now();
            await this.cache.set(cacheKey, type, cached);
            return cached;
        }
        return null;
    }
    private async executeDownload(
        info: VideoInfo,
        type: "video" | "audio" = "video"
    ): Promise<DownloadResult | null> {
        try {
            const videoID = info.id;
            let filename: string;
            let outputPath: string;
            switch (type) {
                case "audio":
                    filename = `${sanitizeString(info.title)}`;
                    outputPath = path.join(audioCacheDir, filename);
                    break;
                case "video":
                    filename = `${sanitizeString(info.title)}`;
                    outputPath = path.join(videoCacheDir, filename);
                    break;
                default:
                    throw new Error(`Unsupported download type: ${type}`);
            }

            let downloadResult: DownloadFinishResult;
            switch (type) {
                case "video":
                    downloadResult = await this.ytdlp
                        .download(videoID, { output: outputPath })
                        .filter("audioandvideo")
                        .quality("highest")
                        .type("mp4")
                        .run();
                    break;
                case "audio":
                    downloadResult = await this.ytdlp.download(videoID, { output: outputPath }).filter("audioonly").quality("highest").type("aac").run();
                    break;
                default:
                    throw new Error(`Unsupported download type: ${type}`);
            }

            const resolvedPath = downloadResult.filePaths[0];

            const stats = fs.statSync(resolvedPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            logger.debug(`Downloaded ${filename} (${fileSizeMB.toFixed(2)} MB)`);
            return { size: stats.size, date: Date.now(), videoData: info, filename: filename, path: resolvedPath };
        } catch (e) {
            logger.error(e, `Error downloading ${info.title} (${info.id})`);
            return null;
        }
    }


    private async enforceCacheSizeLimit(type: "video" | "audio"): Promise<void> {
        logger.debug("Enforcing cache size limit");
        const maxSizeMB = type === "audio" ? this.maxAudioCacheSizeMB : this.maxVideoCacheSizeMB;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        const totalSize = await this.cache.getTotalSize(type);

        if (totalSize <= maxSizeBytes) {
            logger.debug("Cache size limit not exceeded");
            return;
        }

        let runningSize = totalSize;
        for (; runningSize > maxSizeBytes;) {
            const entry = await this.cache.getOldest(type, this.minCacheAgeMs);
            
            if (!entry) {
                logger.warn(`No evictable entries found for ${type} cache, but size limit exceeded. Current size: ${runningSize / (1024 * 1024)} MB, max size: ${maxSizeMB} MB.`);
                break;
            }
            await fs.promises.unlink(entry.path).catch(async (err) => {
                if (err.code === "ENOENT") {
                    logger.warn(`File not found for deletion: ${entry.path}`);
                    return
                }
                logger.error(err, `Failed to delete file: ${entry.path}`);
            })
            logger.info(`Evicted ${entry.filename} from ${type} cache to enforce size limit.`);
            // Will become an infinite loop if we don't delete the entry from the cache, so delete it anyway
            runningSize -= entry.size;
            await this.cache.delete(entry.hash, type);

        }
    }
}
let instance: DownloadManager;


export const DownloadManagerSingleton = function () {
    if (!instance) {
        instance = new DownloadManager();
    }
    return instance;
};