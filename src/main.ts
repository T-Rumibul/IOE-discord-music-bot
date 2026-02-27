import { IOEClient } from "./client/IOEClient.js";
import { logger } from './utils/index.js';
import { startServer } from "./server.js";
import { getConfig } from "./config.js";
const config = getConfig();

if(!config.DOWNLOADS_COMMAND_DISABLED) {
    await startServer().catch(e => logger.error(e, 'Failed to start server'));
}
const client = new IOEClient(config.CLIENT_ID, config.TOKEN);
client.login();