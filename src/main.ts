import fs from "fs";
import path from "path/win32";
import { IOEClient } from "./client/IOEClient.js";
import { logger } from './utils/index.js';
import { startServer } from "./server.js";
import { getConfig } from "./config.js";
import { downloadBinary, checkBinary, BinaryState } from "./utils/ytdlpBinaries.js";


const config = getConfig();
async function main() {
    const ytdlpBinaryState = await checkBinary()
    if (ytdlpBinaryState === BinaryState.NEED_UPDATE || ytdlpBinaryState === BinaryState.NOT_FOUND) {
        await downloadBinary()
    }

    if (!config.DOWNLOADS_COMMAND_DISABLED) {
        await startServer().catch(e => logger.error(e, 'Failed to start server'));
    }
    const logDirIsExists = fs.existsSync(path.join(process.cwd(), config.LOG_FOLDER))
    const downloadsDirIsExists = fs.existsSync(path.join(process.cwd(), config.DOWNLOADS_FOLDER))
    if (!logDirIsExists) {
        fs.mkdirSync(path.join(process.cwd(), config.LOG_FOLDER))
    }
    if (!downloadsDirIsExists) {
        fs.mkdirSync(path.join(process.cwd(), config.DOWNLOADS_FOLDER))
    }
    const client = new IOEClient(config.CLIENT_ID, config.TOKEN);
    client.login();
}

main()