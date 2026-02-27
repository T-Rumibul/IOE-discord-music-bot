import express from 'express';
import path from 'path';
import { getConfig } from './config.js';
import { logger } from './utils/index.js';
import crypto from 'crypto'
const config = getConfig();
const app = express();
const downloadsDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER);

const accessKeys = new Map()
/**
 * Creates an access key for a downloaded video.
 * The access key is valid for ttl milliseconds.
 * @param {number} ttl - The time to live for the access key in milliseconds.
 * @param {string} filename - The filename of the downloaded video.
 * @returns {string} The access key.
 */
export function createAccessKey(ttl: number, filename: string) {
    const key = crypto.randomUUID();
    accessKeys.set(key, {
        ttl: Date.now() + ttl,
        filename
    })
    return key
}
// Simple middleware to prevent public access to all files
app.all('/*path', (req, res, next) => {
    const key = req.query.key
    if (!key) {
        res.status(403).send('Forbidden')
        return
    }
    const accessKey = accessKeys.get(key)
    if (!accessKey) {
        res.status(403).send('Forbidden')
        return
    }
    if (accessKey.ttl < Date.now()) {
        res.status(403).send('Forbidden')
        return
    }
    const filename = req.path.split('/').pop()
    if(accessKey.filename !== filename) {
        res.status(403).send('Forbidden')
        return
    }
    next()
})
app.use('/downloads', express.static(downloadsDir));

export function startServer() {
    return new Promise<void>((resolve) => {
        app.listen(config.PORT, () => {
            logger.info(`Server started on port ${config.PORT}`);
            resolve();
        });
        
    })

}