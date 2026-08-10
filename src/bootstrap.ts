import fs from "fs";
import path from "path";
import { getConfig } from "./config.js";
import { BinaryState, checkBinary, downloadBinary } from "./utils/ytdlpBinaries.js";
import { downloadFfmpegBinaries, getFfmpegBinarysPath } from "./utils/ffmpegBinaries.js";
const config = getConfig();
const ytdlpBinaryState = await checkBinary()
if (ytdlpBinaryState === BinaryState.NEED_UPDATE || ytdlpBinaryState === BinaryState.NOT_FOUND) {
    await downloadBinary()
}
const ffmpegBinaryPath = getFfmpegBinarysPath()
if (!fs.existsSync(ffmpegBinaryPath.ffmpeg) || !fs.existsSync(ffmpegBinaryPath.ffprobe)) {
    await downloadFfmpegBinaries()
}

const logDirIsExists = fs.existsSync(path.join(process.cwd(), config.LOG_FOLDER))
const downloadsDirIsExists = fs.existsSync(path.join(process.cwd(), config.DOWNLOADS_FOLDER))
if (!logDirIsExists) {
    fs.mkdirSync(path.join(process.cwd(), config.LOG_FOLDER))
}
if (!downloadsDirIsExists) {
    fs.mkdirSync(path.join(process.cwd(), config.DOWNLOADS_FOLDER))
}

try {
    const { default: main } = await import("./main.js");
    await main();
} catch (e) {
    console.error(e, "Failed to start main");
}