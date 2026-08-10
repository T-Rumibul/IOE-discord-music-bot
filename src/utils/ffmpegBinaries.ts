import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip'
import { getConfig } from '../config.js';

const config = getConfig();
const binariesPath = path.join(process.cwd())
const zip = new JSZip()
async function extractZip(zipPath: string, options: { dir: string }): Promise<void> {
    const archive = fs.readFileSync(zipPath);
    const zipData = await zip.loadAsync(archive)

    const fileNames = Object.keys(zipData.files)
    fs.mkdirSync(options.dir, { recursive: true })
    for (const fileName of fileNames) {
        const file = zipData.files[fileName]
        if (!file.dir) {
            const content = await file.async('nodebuffer')
            fs.writeFileSync(path.join(options.dir, fileName), content)
        }
    }

}
const API_URL = 'https://ffbinaries.com/api/v1/version/6.1';

interface PlatformBinaries {
    ffmpeg?: string;
    ffprobe?: string;
    ffplay?: string;
    ffserver?: string;
}

interface FfbinariesManifest {
    version: string;
    permalink: string;
    bin: Record<string, PlatformBinaries>;
}

type BinaryName = 'ffmpeg' | 'ffprobe';

// Map Node's os.platform()/os.arch() to ffbinaries platform keys
function getPlatformKey(): string {
    const platform = os.platform(); // 'darwin' | 'linux' | 'win32'
    const arch = os.arch();         // 'x64' | 'arm64' | 'ia32' | ...

    const map: Record<string, string> = {
        'win32-x64': 'windows-64',
        'win32-ia32': 'windows-32',
        'darwin-x64': 'osx-64',
        'darwin-arm64': 'osx-arm64',
        'linux-x64': 'linux-64',
        'linux-ia32': 'linux-32',
        'linux-arm64': 'linux-arm64',
        'linux-arm': 'linux-armhf',
    };

    const key = map[`${platform}-${arch}`];
    if (!key) {
        throw new Error(`Unsupported platform/arch combo: ${platform}-${arch}`);
    }
    return key;
}
export function getFfmpegBinarysPath() {
      return {
        dir: binariesPath,
        ffmpeg: path.join(binariesPath, os.platform() === 'win32' ? `ffmpeg.exe` : 'ffmpeg'),
        ffprobe: path.join(binariesPath, os.platform() === 'win32' ? `ffprobe.exe` : 'ffprobe')
      };
}
async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText} (${url})`);
    }
    return res.json() as Promise<T>;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
}

async function downloadAndExtract(
    name: BinaryName,
    url: string | undefined,
    outDir: string,
    tmpDir: string
): Promise<void> {
    if (!url) {
        console.warn(`No ${name} build available for this platform, skipping.`);
        return;
    }

    const zipPath = path.join(tmpDir, `${name}.zip`);
    console.log(`Downloading ${name} from ${url} ...`);
    await downloadFile(url, zipPath);

    console.log(`Extracting ${name} ...`);
    await extractZip(zipPath, { dir: outDir });

    // Ensure the binary is executable on unix-like systems
    const binName = os.platform() === 'win32' ? `${name}.exe` : name;
    const binPath = path.join(outDir, binName);
    if (fs.existsSync(binPath) && os.platform() !== 'win32') {
        fs.chmodSync(binPath, 0o755);
    }

    fs.unlinkSync(zipPath);
    console.log(`${name} ready at ${binPath}`);
}

export async function downloadFfmpegBinaries(): Promise<void> {
    const outDir = binariesPath;
    fs.mkdirSync(outDir, { recursive: true });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffbinaries-'));

    try {
        const platformKey = getPlatformKey();
        console.log(`Detected platform: ${platformKey}`);

        console.log('Fetching manifest from ffbinaries.com ...');
        const manifest = await fetchJson<FfbinariesManifest>(API_URL);
        console.log(`Version: ${manifest.version}`);

        const platformData = manifest.bin[platformKey];
        if (!platformData) {
            throw new Error(`No binaries listed for platform "${platformKey}"`);
        }

        await downloadAndExtract('ffmpeg', platformData.ffmpeg, outDir, tmpDir);
        await downloadAndExtract('ffprobe', platformData.ffprobe, outDir, tmpDir);

        console.log(`\nDone. Binaries are in: ${outDir}`);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
