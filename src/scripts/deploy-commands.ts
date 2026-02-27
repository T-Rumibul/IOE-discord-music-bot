import { IOEClient } from "../client/IOEClient.js";

import { logger } from '../utils/index.js';
import { getConfig } from "../config.js";
const config = getConfig();

const client = new IOEClient(config.CLIENT_ID, config.TOKEN);

// Needed to login to fetch guilds for guild specific commands
await client.login()
await client.commands.deploy();
process.exit(0);
