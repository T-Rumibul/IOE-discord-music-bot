import dotenv from "dotenv";

dotenv.config();
function validateEnv() {
  const requiredEnvVars = ['DISCORD_TOKEN', 'DOWNLOADS_FOLDER', 'HOST', 'PORT', 'DISCORD_CLIENT_ID'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
}

export function getConfig() {
  validateEnv();
  return {
    TOKEN: process.env.DISCORD_TOKEN!,
    CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
    DOWNLOADS_FOLDER: process.env.DOWNLOADS_FOLDER!,
    DOWNLOADS_COMMAND_DISABLED: process.env.DOWNLOADS_COMMAND_DISABLED === 'true',
    HOST: process.env.HOST!,
    PORT: process.env.PORT!,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    PLAYER_GIF_IDLE: process.env.PLAYER_GIF_IDLE || '',
    PLAYER_GIF_PLAYING: process.env.PLAYER_GIF_PLAYING || '',
  }
}