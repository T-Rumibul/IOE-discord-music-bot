import { Stream, VideoInfo } from "ytdlp-nodejs";
import { YTDLP, logger, regexYoutube, sanitizeString } from "../utils/index.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Mutex } from "../utils/index.js";
import { getConfig } from '../config.js';
const config = getConfig();
const ytdlp = new YTDLP();

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
    constructor(private chacheDir: string) {
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
        fs.writeFileSync(path.join(this.chacheDir, "downloadsCache.json"), data);
    }
    private loadFromDisk() {
        try {
            const pathToFile = path.join(this.chacheDir, "downloadsCache.json");
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
    /**
     * Public entry point. Queues a download and returns a promise that
     * resolves when the download (or cache hit) is complete.
     */
    async download(videoURL: string, type: "video" | "audio"): Promise<DownloadResult | null> {
        logger.debug(`Downloading ${videoURL}`);
        const unlock = await this.downloadMutex.lock();
        try {
            const result = await this.executeDownload(videoURL, type);
            logger.debug(`Download complete for ${videoURL}, result: ${JSON.stringify(result)}`);
            return result;
        } catch (e) {
            logger.error(e, `Error in download manager for ${videoURL}`);
            return null;
        } finally {
            unlock();
        }
    }

    private async executeDownload(
        videoURL: string,
        type: "video" | "audio" = "video"
    ): Promise<DownloadResult | null> {
        try {
            const urlMatch = videoURL.match(regexYoutube);
            if (!urlMatch) return null;

            const videoID = new URL(urlMatch[0]).searchParams.get("v") ?? "";
            if (!videoID) return null;

            const cacheKey = crypto
                .createHash("md5")
                .update(videoID)
                .digest("hex");
            const cache = type === "audio" ? this.audioCache : this.videoCache;
            // Return cached entry if it exists
            const cached = cache.get(cacheKey);
            if (cached) {
                logger.info(`Cache hit for video ID: ${videoID}`);
                // update access time to prevent eviction
                cached.date = new Date();
                return { path: cached.path, filename: cached.filename, size: cached.size, date: cached.date, videoData: cached.videoData };
            }

            const info = await ytdlp.getInfoAsync(videoID) as VideoInfo;
            
            const filename = type === "audio" ? `${sanitizeString(info.title)}.m4a` : `${sanitizeString(info.title)}.mp4`;
            const outputPath = type === "audio" ? path.join(audioCacheDir, filename) : path.join(videoCacheDir, filename);

            const downloadedFiles = type === "audio" ? await ytdlp.download(videoID, { output: outputPath }).filter("audioonly").quality("highest").type("aac").run() : await ytdlp
                .download(videoID, { output: outputPath })
                .filter("audioandvideo")
                .quality("highest")
                .type("mp4")
                .run();

            const resolvedPath = downloadedFiles.filePaths[0];

            const stats = fs.statSync(resolvedPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            cache.set(cacheKey, {
                path: resolvedPath,
                filename,
                size: fileSizeMB,
                date: new Date(),
                videoData: info
            });
            logger.debug(`Downloaded ${filename} (${fileSizeMB.toFixed(2)} MB)`);
            this.enforceCacheSizeLimit(type);

            return { path: resolvedPath, filename, size: fileSizeMB, date: new Date(), videoData: info };
        } catch (e) {
            logger.error(e, `Error downloading ${videoURL}`);
            return null;
        }
    }


    private async enforceCacheSizeLimit(type : "video" | "audio"): Promise<void> {
        logger.debug("Enforcing cache size limit");
        const maxSizeMB = type === "audio" ? this.maxAudioCacheSizeMB : this.maxVideoCacheSizeMB;
        const entries = type === "audio" ? Array.from(this.audioCache.entries()) : Array.from(this.videoCache.entries());

        const totalSize = entries.reduce((sum, [, v]) => sum + v.size, 0);
        if (totalSize <= maxSizeMB) {
            logger.debug("Cache size limit not exceeded");
            return;
        }

        const now = Date.now();

        // Only evict entries older than the minimum cache age (1 hour)
        const evictable = entries
            .filter(([, v]) => now - v.date.getTime() > this.minCacheAgeMs)
            .sort((a, b) => a[1].date.getTime() - b[1].date.getTime()); // oldest first

        let runningSize = totalSize;
        for (const [key, value] of evictable) {
            logger.info(`Evicting cache entry: ${key} (${value.filename})`);
            if (runningSize <= maxSizeMB) break;
            await new Promise(resolve => fs.unlink(value.path, resolve)); // delete file
            runningSize -= value.size;

            (type === "audio") ? this.audioCache.delete(key) : this.videoCache.delete(key);

            logger.info(`Evicted ${type} cache entry: ${key} (${value.filename})`);
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