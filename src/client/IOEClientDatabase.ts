import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../utils/index.js'
import type { IOEClient } from './IOEClient.js';
const dbPath = path.join(import.meta.dirname, '..', '..', '/database.db');

// open the database
const db = new Database(dbPath, { verbose: (msg) => logger.debug(msg, 'Database') });

await db.exec('CREATE TABLE IF NOT EXISTS guilds (guild_id TEXT, music_channel TEXT, PRIMARY KEY(guild_id))');
export class IOEClientDatabase {
  private db = db;
  constructor() {
  }


}