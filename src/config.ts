import dotenv from "dotenv";
import path from "path/win32";

dotenv.config();
function validateEnv() {
  const requiredEnvVars = ['HOST'];
  if(process.env.prod === 'false') {
    requiredEnvVars.push('DEVTOKEN', 'DEV_CLIENT_ID');
  } else {
    requiredEnvVars.push('DISCORD_TOKEN', 'DISCORD_CLIENT_ID');
  }
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
}

export function getConfig() {
  validateEnv();
  return {
    TOKEN: process.env.prod === 'true' ? process.env.DISCORD_TOKEN! : process.env.DEVTOKEN!,
    CLIENT_ID: process.env.prod === 'true' ? process.env.DISCORD_CLIENT_ID! : process.env.DEV_CLIENT_ID!,
    DOWNLOADS_FOLDER: "downloads_tmp",
    LOG_FOLDER: "logs",
    BINARY_FOLDER: "binaries",
    DOWNLOADS_COMMAND_DISABLED: process.env.DOWNLOADS_COMMAND_DISABLED === 'true',
    HOST: process.env.HOST!,
    PORT: process.env.PORT! || 3000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    PLAYER_GIF_IDLE: process.env.PLAYER_GIF_IDLE || '',
    PLAYER_GIF_PLAYING: process.env.PLAYER_GIF_PLAYING || '',
    COOKIE_FILE: process.env.COOKIE_FILE || path.join(process.cwd(), 'cookies.txt'),
  }
}