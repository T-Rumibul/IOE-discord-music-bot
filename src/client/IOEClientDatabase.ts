import type { IOEClient } from './IOEClient.js';
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { SQL } from 'sql-template-strings';
import path from 'path';
import { logger } from '../utils/index.js'
const dbPath = path.join(import.meta.dirname, '..', '..', '/database.db');

// open the database
const db = await open({
  filename: dbPath,
  driver: sqlite3.Database
})

await db.exec('CREATE TABLE IF NOT EXISTS guilds (guild_id TEXT, music_channel TEXT, PRIMARY KEY(guild_id))');
export class IOEClientDatabase {
  private db: Database<sqlite3.Database, sqlite3.Statement> = db;
  constructor() {
  }


}