import pino from "pino";
import dotenv from "dotenv";
dotenv.config();


export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss"
    }
  }
});

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