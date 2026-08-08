import { DownloadFinishResult, VideoInfo } from "ytdlp-nodejs";
import { YTDLP, logger, sanitizeString } from "../utils/index.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sqlite3 from 'sqlite3'
import { SQL } from 'sql-template-strings';
import { open, Database } from 'sqlite'
import { Mutex } from "../utils/index.js";
import { getConfig } from '../config.js';
const config = getConfig();
export const downloadsDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER);
export const videoCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "video");
export const audioCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "audio");
const dbPath = path.join(process.cwd(), config.DOWNLOADS_FOLDER, '/cache.db');

// open the database
const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
})
await db.exec('CREATE TABLE IF NOT EXISTS audio (hash TEXT, path TEXT, filename TEXT, size INTEGER, date INTEGER, videoData TEXT, reads INTEGER, PRIMARY KEY(hash))');
await db.exec('CREATE TABLE IF NOT EXISTS video (hash TEXT, path TEXT, filename TEXT, size INTEGER, date INTEGER, videoData TEXT, reads INTEGER, PRIMARY KEY(hash))');
await db.exec('CREATE INDEX IF NOT EXISTS idx_date ON audio(date)');
await db.exec('CREATE INDEX IF NOT EXISTS idx_date ON video(date)');
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

interface DownloadResult {
    path: string;
    filename: string;
    size: number;
    date: number;
    videoData: VideoInfo;
}

class Cache {
    private db: Database<sqlite3.Database, sqlite3.Statement> = db;
    async set(hash: string, type: "video" | "audio", value: CacheEntry | CacheEntryWithHash): Promise<this> {
        const query = type === "video" ? SQL`INSERT OR REPLACE INTO video` : SQL`INSERT OR REPLACE INTO audio`;
        await this.db.run(query.append(SQL` (hash, path, filename, size, date, videoData, reads) VALUES (${hash}, ${value.path}, ${value.filename}, ${value.size}, ${value.date}, ${JSON.stringify(value.videoData)}, ${value.reads})`));
        return this;
    }
    async get(hash: string, type: "video" | "audio"): Promise<CacheEntryWithHash | null> {
        const query = type === "video" ? SQL`SELECT * FROM video` : SQL`SELECT * FROM audio`;
        const row = await this.db.get<CacheEntryWithHash>(query.append(SQL` WHERE hash = ${hash}`));
        if (!row) return null;
        return row;
    }
    async getAll(type: "video" | "audio"): Promise<CacheEntryWithHash[]> {
        const query = type === "video" ? SQL`SELECT * FROM video` : SQL`SELECT * FROM audio`;
        const rows = await this.db.all<CacheEntryWithHash[]>(query);
        return rows;
    }
    async getTotalSize(type: "video" | "audio"): Promise<number> {
        const query = type === "video" ? SQL`SELECT SUM(size) as totalSize FROM video` : SQL`SELECT SUM(size) as totalSize FROM audio`;
        const row = await this.db.get<{ totalSize: number }>(query);
        if (!row) {
            logger.warn(`Failed to get total size for ${type} cache, returning 0`);
            return 0;
        }
        return row.totalSize;
    }
    async getOldest(type: "video" | "audio", minAgeMs: number): Promise<CacheEntryWithHash | null> {
        const query = type === "video" ? SQL`SELECT * FROM video` : SQL`SELECT * FROM audio`;
        const evictable = await db.all<CacheEntryWithHash[]>(
            query.append(SQL` WHERE date < ${Date.now() - minAgeMs} ORDER BY date ASC LIMIT 1`,
            ));
        return evictable[0] ?? null;
    }
    async delete(hash: string, type: "video" | "audio"): Promise<boolean> {
        const query = type === "video" ? SQL`DELETE FROM video` : SQL`DELETE FROM audio`;
        const result = await this.db.run(query.append(SQL` WHERE hash = ${hash}`));
        return result.changes && result.changes > 0 ? true : false;
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