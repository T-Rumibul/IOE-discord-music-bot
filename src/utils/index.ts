import pino from "pino"
import path from "path";
import { Download, FormatOptions, PlaylistInfo, QualityOptions, Stream, VideoInfo, YtDlp, YtDlpOptions } from "ytdlp-nodejs";
import { getConfig } from "../config.js";
import { binariesMapping } from "./ytdlpBinaries.js";
const ytdlp = new YtDlp();
const cookiesFile = path.join(process.cwd(), 'cookies.txt')
const config = getConfig();

const pinoTransport = pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "yyyy-mm-dd HH:MM:ss"
      }
    },
    {
      target: 'pino/file',
      options: {
        destination: path.join(process.cwd(), 'logs', 'app.log'),
        translateTime: "yyyy-mm-dd HH:MM:ss"
      }
    },
  ],
});

export const logger = pino({
  level: config.LOG_LEVEL,
}, pinoTransport);

/**
 * Shuffles the given array and returns the shuffled array.
 * @param {T[]} inputArray The array to be shuffled.
 * @returns {T[]} The shuffled array.
 * @example
 * const array = [1, 2, 3, 4, 5];
 * const shuffledArray = shuffle(array);
 * console.log(shuffledArray); // [3, 1, 5, 2, 4]
 */
export function shuffle<T>(inputArray: T[]): T[] {
  const a = inputArray;
  if (a.length === 0) return a;
  // Iterate over the array backwards, starting at the last element
  for (let i = a.length - 1; i > 0; i -= 1) {
    // Generate a random index between 0 and the current index
    const j = Math.floor(Math.random() * (i + 1));

    // Swap the current element with a randomly selected element
    const temp = a[i]!;
    a[i] = a[j]!;
    a[j] = temp;
  }
  return a;
}


/**
 * A function that returns a Promise that resolves after a specified
 * amount of time in seconds has passed.
 * @param {number} time The amount of time in seconds to wait before resolving the Promise.
 * @returns {Promise<void>} A Promise that resolves after the specified amount of time has passed.
 */
export const sleep = (time: number) => {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, time * 1000)
  })
}

// From ytdlp-nodejs
interface InfoOptions {
  /**
   * If `true`, returns a flat list with limited information for playlist items.
   * If `false`, fetches full information for each video in the playlist.
   * @default true
   */
  flatPlaylist?: boolean;
  /**
   * A string of cookies to use for authentication.
   */
  cookies?: string;
  /**
   * Use cookies automatically fetched from the browser.
   */
  cookiesFromBrowser?: string;
  /**
   * Disable using cookies from the browser.
   */
  noCookiesFromBrowser?: boolean;
  /**
   * Disable cookies entirely (overrides other cookie options).
   */
  noCookies?: boolean;
}


/**
 * Extended YtDlp wrapper that automatically applies cookies when none is provided.
 *
 * This prevents repeated cookies configuration across the codebase.
 */
export class YTDLP extends YtDlp {
  constructor(options: YtDlpOptions = { binaryPath: getYtdlpBinaryPath() }) {
    if (!options.binaryPath) {
      options = { ...options, binaryPath: getYtdlpBinaryPath() }
    }
    super(options);
  }

  stream<F extends keyof QualityOptions>(url: string, options: Omit<FormatOptions<F>, "onProgress"> = { cookies: cookiesFile }): Stream {
    if (!options.cookies) {
      options = { ...options, cookies: cookiesFile }
    }
    return super.stream(url, options);
  }
  download<F extends keyof QualityOptions>(url: string, options: Omit<FormatOptions<F>, "onProgress" | "beforeDownload"> = { cookies: cookiesFile }): Download {
    if (!options.cookies) {
      options = { ...options, cookies: cookiesFile }
    }
    return super.download(url, options);
  }
  getInfoAsync<T extends "video" | "playlist">(url: string, options: InfoOptions = { cookies: cookiesFile }): Promise<T extends "video" ? VideoInfo : PlaylistInfo> {
    if (!options.cookies) {
      options = { ...options, cookies: cookiesFile }
    }
    return super.getInfoAsync<T>(url, options);
  }
}

export const regexYoutube =
  /.*(?:(?:youtu.be\/)|(?:v\/)|(?:\/u\/\w\/)|(?:embed\/)|(?:watch\?))\??v?=?([^#\&\?]*).*/;


/**
 * Sanitizes a string by removing all non-Latin and non-Cyrillic characters and converting to lowercase.
 * @param {string} input The string to sanitize.
 * @returns {string} The sanitized string.
 */
export const sanitizeString = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^\p{Script=Latin}\p{Script=Cyrillic}\p{N}]/gu, "");
}



export class Mutex {
  // Represents the promise that resolves when the current lock holder releases.
  // Initially resolved, meaning the mutex is free.
  private chain = Promise.resolve();

  lock() {
    // This function will be assigned to resolve the new promise.
    // It becomes the "unlock" function returned to the caller.
    let unlock!: () => void;

    // Create a new pending promise representing THIS lock being held.
    // It will resolve only when unlock() is called.
    const next = new Promise<void>(resolve => {
      // Store resolver so we can release the lock later.
      unlock = () => {
        resolve();
      };
    });

    // Create a promise that waits for the previous lock (this.chain).
    // When the previous lock finishes, return the unlock function
    // to the caller so they can enter the critical section.
    const rv = this.chain.then(() => unlock);

    // Update the chain to the new pending promise.
    // This ensures the NEXT caller waits until this one unlocks.
    this.chain = next;

    // Return a promise that resolves when it's the caller’s turn.
    // The resolved value is the unlock function.
    return rv;
  }
}


export const getYtdlpBinaryPath = () => {
  const arch = process.arch;
  const platform = process.platform;

  if (binariesMapping[platform + '_' + arch]) {
    return path.join(process.cwd(), 'binaries', binariesMapping[platform + '_' + arch]);
  }
  throw new Error(`Cannot find ytdlp binary for ${platform}_${arch}`);

}


export const checkFileURL = async (url: string) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}


export const msToMinutesAndSeconds = (ms: number) => {
  var minutes = Math.floor(ms / 60000);
  var seconds = (ms % 60000) / 1000;
  return (
    seconds == 60 ?
      (minutes + 1) + ":00" :
      minutes + ":" + (seconds < 10 ? "0" : "") + seconds
  );
}
