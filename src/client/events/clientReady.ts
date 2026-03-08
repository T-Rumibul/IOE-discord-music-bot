import { defineEventHandler } from "../IOEClientEvents.js";
import { logger } from '../../utils/index.js';

export default defineEventHandler<"clientReady">((client) => {
logger.info(`Logged in as ${client.user?.tag}!`);
  
}, { once: true });
