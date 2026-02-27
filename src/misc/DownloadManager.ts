import { VideoInfo } from "ytdlp-nodejs";
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
}

interface DownloadResult {
    path: string;
    filename: string;
}

class DownloadsCache<K, V> extends Map<K, V> {
    constructor(private chacheDir: string) {
        super();
        this.loadFromDisk();
    }
    set(key: K, value: V): this {
        super.set(key, value);
        this.writeToDisk();
        return this;
    }
    delete(key: K): boolean {
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
            const entries: [K, V][] = JSON.parse(data);
            entries.forEach(([k, v]) => super.set(k, v));
        } catch (e) {
            logger.warn("No existing cache found, starting with an empty cache.");
        }
    }

}
export class DownloadManager {
    private maxCacheSizeMB = 1000;
    private minCacheAgeMs = 60 * 60 * 1000; // 1 hour
    private downloadMutex = new Mutex();
    // Stores resolved cache entries
    private downloadsCache = new DownloadsCache<string, CacheEntry>(path.join(process.cwd(), config.DOWNLOADS_FOLDER));

    /**
     * Public entry point. Queues a download and returns a promise that
     * resolves when the download (or cache hit) is complete.
     */
    async download(videoURL: string): Promise<DownloadResult | null> {
        logger.debug(`Downloading ${videoURL}`);
        const unlock = await this.downloadMutex.lock();
        try {
            const result = await this.executeDownload(videoURL);
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
        videoURL: string
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

            // Return cached entry if it exists
            const cached = this.downloadsCache.get(cacheKey);
            if (cached) {
                logger.info(`Cache hit for video ID: ${videoID}`);
                // update access time to prevent eviction
                cached.date = new Date();
                return { path: cached.path, filename: cached.filename };
            }

            const info = await ytdlp.getInfoAsync(videoID) as VideoInfo;

            const filename = `${sanitizeString(info.title)}.mp4`;
            const outputPath = path.join(process.cwd(), config.DOWNLOADS_FOLDER, filename);

            const downloadedFiles = await ytdlp
                .download(videoID, { output: outputPath })
                .filter("audioandvideo")
                .quality("highest")
                .type("mp4")
                .run();

            const resolvedPath = downloadedFiles.filePaths[0];

            const stats = fs.statSync(resolvedPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            this.downloadsCache.set(cacheKey, {
                path: resolvedPath,
                filename,
                size: fileSizeMB,
                date: new Date(),
            });
            logger.debug(`Downloaded ${filename} (${fileSizeMB.toFixed(2)} MB)`);
            this.enforceCacheSizeLimit();

            return { path: resolvedPath, filename };
        } catch (e) {
            logger.error(e, `Error downloading ${videoURL}`);
            return null;
        }
    }


    private async enforceCacheSizeLimit(): Promise<void> {
        logger.debug("Enforcing cache size limit");
        const entries = Array.from(this.downloadsCache.entries());

        const totalSize = entries.reduce((sum, [, v]) => sum + v.size, 0);
        if (totalSize <= this.maxCacheSizeMB) {
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
            if (runningSize <= this.maxCacheSizeMB) break;
            await new Promise(resolve => fs.unlink(value.path, resolve)); // delete file
            runningSize -= value.size;
            this.downloadsCache.delete(key);
            logger.info(`Evicted cache entry: ${key} (${value.filename})`);
        }
    }
}