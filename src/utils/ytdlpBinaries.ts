import fs from 'fs';
import path from 'path';
import crypto from 'crypto'
const binariesPath = path.join(process.cwd(), 'binaries')
type githubResponse = {
    assets: {
        name: string,
        browser_download_url: string,
        digest: string
    }[]
}

export const enum BinaryState {
    LATEST,
    NEED_UPDATE,
    NOT_FOUND
}
export const binariesMapping: Record<string, string> = {
    win32_x64: 'yt-dlp.exe',
    linux_x64: 'yt-dlp_linux',
    linux_arm64: 'yt-dlp_linux_aarch64',
    win32_arm64: 'yt-dlp_arm64.exe'
}
const fetchAsset = async () => {
    const resp = await fetch(`https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`, {
        headers: {
            'accept': 'application/vnd.github+json'
        }
    })
    const json = await resp.json() as githubResponse
    if (!json || !json.assets) {
        throw new Error('Fetch request to github API failed.')
    }
    const arch = process.arch;
    const platform = process.platform;
    if (!binariesMapping[platform + '_' + arch]) {
        throw new Error('Unknown platform or arch, check binariesMappings and add your platform manually.');
    }

    const assets = json.assets.filter((value) => {
        return value.name === binariesMapping[platform + '_' + arch]
    })
    const asset = assets[0]
    if (!asset) {
        throw new Error('Cannot find binary corresponding to your platform.')
    }
    return asset;
}


export const downloadBinary = async () => {
    const asset = await fetchAsset()

    const buffer = await (await fetch(asset.browser_download_url)).arrayBuffer()
    if (!fs.existsSync(binariesPath)) {
        fs.mkdirSync(binariesPath)
    }
    fs.writeFileSync(path.join(binariesPath, asset.name), Buffer.from(buffer))

}


const getHash = (path: string) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const rs = fs.createReadStream(path);
        rs.on('error', reject);
        rs.on('data', chunk => hash.update(chunk));
        rs.on('end', () => resolve(hash.digest('hex')));
    })
}

export const checkBinary = async () => {
    const arch = process.arch;
    const platform = process.platform;
    const filename = binariesMapping[platform + '_' + arch]
    if (!filename) {
        throw new Error('Unknown platform or arch, check binariesMappings and add your platform manually.');
    }
    const pathToBinary = path.join(binariesPath, filename)
    if (fs.existsSync(pathToBinary)) {
        const hash = await getHash(pathToBinary);
        const asset = await fetchAsset()
        const assetHash = asset.digest.split(':')[1]
        if(assetHash === hash) {
            return BinaryState.LATEST
        }
        return BinaryState.NEED_UPDATE
    }
    return BinaryState.NOT_FOUND
}
