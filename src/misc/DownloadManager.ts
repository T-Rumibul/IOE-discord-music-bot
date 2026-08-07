import { DownloadFinishResult, VideoInfo } from "ytdlp-nodejs";
import { YTDLP, logger, sanitizeString } from "../utils/index.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Mutex } from "../utils/index.js";
import { getConfig } from '../config.js';
const config = getConfig();

interface CacheEntry {
    path: string;
    filename: string;
    size: number;
    date: Date;
    videoData: VideoInfo;
}

interface DownloadResult {
    path: string;
    filename: string;
    size: number;
    date: Date;
    videoData: VideoInfo;
}

class Cache<V> extends Map<string, V> {
    constructor(private cacheDir: string) {
        super();
        this.loadFromDisk();
    }
    set(key: string, value: V): this {
        super.set(key, value);
        this.writeToDisk();
        return this;
    }
    delete(key: string): boolean {
        const result = super.delete(key);
        this.writeToDisk();
        return result;
    }
    private writeToDisk() {
        const entries = Array.from(this.entries());
        const data = JSON.stringify(entries);
        fs.writeFileSync(path.join(this.cacheDir, "downloadsCache.json"), data);
    }
    private loadFromDisk() {
        try {
            const pathToFile = path.join(this.cacheDir, "downloadsCache.json");
            if (!fs.existsSync(pathToFile)) return;
            const data = fs.readFileSync(pathToFile, "utf-8");
            const entries: [string, V][] = JSON.parse(data);
            entries.forEach(([k, v]) => super.set(k, v));
        } catch (e) {
            logger.warn("No existing cache found, starting with an empty cache.");
        }
    }

}
export const downloadsDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER);
export const videoCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "video");
export const audioCacheDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER, "audio");
class DownloadManager {
    private maxVideoCacheSizeMB = 1000;
    private maxAudioCacheSizeMB = 3000;
    private minCacheAgeMs = 60 * 60 * 1000; // 1 hour
    private downloadMutex = new Mutex();
    // Stores resolved cache entries
    private videoCache = new Cache<CacheEntry>(videoCacheDir);
    private audioCache = new Cache<CacheEntry>(audioCacheDir);
    private ytdlp = new YTDLP()
    /**
     * Public entry point. Returns path to cached file if available, otherwise downloads it.
     * @param {VideoInfo} info - The video information.
     * @param {"video" | "audio"} type - Audioonly or video.
     * @param {boolean} forceDownload - If true, forces a re-download even if the file is cached.
     */
    async download(info: VideoInfo,type: "video" | "audio" = "video", forceDownload: boolean = false): Promise<DownloadResult | null> {
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
            this.saveCacheEntry(info.id, type, { path: result.path, filename: result.filename, size: result.size, date: result.date, videoData: result.videoData });
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
        const cache = type === "audio" ? this.audioCache : this.videoCache;
        cache.set(cacheKey, entry);
        await this.enforceCacheSizeLimit(type);
    }
    public async getCacheEntry(videoID: string, type: "video" | "audio"): Promise<CacheEntry | null> {
        const cacheKey = crypto.createHash("md5").update(videoID).digest("hex");
        const cache = type === "audio" ? this.audioCache : this.videoCache;
        const cached = cache.get(cacheKey);
        if (cached) {
            // update access time to prevent eviction
            cached.date = new Date();
            cache.set(cacheKey, cached);
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
                    filename = `${sanitizeString(info.title)}.m4a`;
                    outputPath = path.join(audioCacheDir, filename);
                    break;
                case "video":
                    filename = `${sanitizeString(info.title)}.mp4`;
                    outputPath = path.join(videoCacheDir, filename);
                    break;
                default:
                    throw new Error(`Unsupported download type: ${type}`);
            }
           
            let downloadResult: DownloadFinishResult;
            switch(type) {
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
            return {size: stats.size, date: new Date(), videoData: info, filename: filename, path: resolvedPath};
        } catch (e) {
            logger.error(e, `Error downloading ${info.title} (${info.id})`);
            return null;
        }
    }


    private async enforceCacheSizeLimit(type : "video" | "audio"): Promise<void> {
    //     logger.debug("Enforcing cache size limit");
    //     const maxSizeMB = type === "audio" ? this.maxAudioCacheSizeMB : this.maxVideoCacheSizeMB;
    //     const entries = type === "audio" ? Array.from(this.audioCache.entries()) : Array.from(this.videoCache.entries());

    //     const totalSize = entries.reduce((sum, [, v]) => sum + v.size, 0);
    //     if (totalSize <= maxSizeMB) {
    //         logger.debug("Cache size limit not exceeded");
    //         return;
    //     }

    //     const now = Date.now();

    //     // Only evict entries older than the minimum cache age (1 hour)
    //     const evictable = entries
    //         .filter(([, v]) => now - v.date.getTime() > this.minCacheAgeMs)
    //         .sort((a, b) => a[1].date.getTime() - b[1].date.getTime()); // oldest first

    //     let runningSize = totalSize;
    //     for (const [key, value] of evictable) {
    //         logger.info(`Evicting cache entry: ${key} (${value.filename})`);
    //         if (runningSize <= maxSizeMB) break;
    //         await fs.promises.unlink(value.path).catch(err => logger.error(err, `Failed to delete file: ${value.path}`));
    //         runningSize -= value.size;

    //         (type === "audio") ? this.audioCache.delete(key) : this.videoCache.delete(key);

    //         logger.info(`Evicted ${type} cache entry: ${key} (${value.filename})`);
    //     }
    }
}
let instance: DownloadManager;


export const DownloadManagerSingleton = function () {
    if (!instance) {
        instance = new DownloadManager();
    }
    return instance;
};