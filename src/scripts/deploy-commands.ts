import { IOEClient } from "../client/IOEClient.js";
import dotenv from "dotenv";
import { logger } from '../utils/index.js';

dotenv.config();
const clientId = process.env.CLIENT_ID;
const token = process.env.TOKEN;
if(!clientId || !token) {
    logger.error('Missing Client ID or Token');
    process.exit(1);
}
const client = new IOEClient(clientId, token);

await client.commands.deploy();

