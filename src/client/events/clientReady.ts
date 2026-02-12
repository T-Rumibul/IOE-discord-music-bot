import { defineEventHandler } from "../IOEClientEvents.js";

export default defineEventHandler<"clientReady">((client) => {
client.logger.info(`Logged in as ${client.user?.tag}!`);
  
}, { once: true });
