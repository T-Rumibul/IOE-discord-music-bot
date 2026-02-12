import type { IOEClient } from './IOEClient.js';
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { SQL } from 'sql-template-strings';
import path from 'path';

const dbPath = path.join(import.meta.dirname, '..', '..', '/database.db');

// open the database
const db = await open({
  filename: dbPath,
  driver: sqlite3.Database
})

await db.exec('CREATE TABLE IF NOT EXISTS guilds (guild_id TEXT, music_channel TEXT, PRIMARY KEY(guild_id))');
export class IOEClientDatabase {
  private db: Database<sqlite3.Database, sqlite3.Statement> = db;
  constructor(private client: IOEClient) {
  }

  /**
   * Retrieves the music channel ID for a guild.
   * @param {string} guildId - The ID of the guild.
   * @returns {Promise<string | null>} A promise resolving to the music channel ID if found, null otherwise.
   * If an error occurs while fetching the data, the promise resolves to null.
   */
  async getMusicChannel(guildId: string): Promise<string | null> {
    try {
      const musicChannel = await this.db.get<{ music_channel: string }>(SQL`SELECT music_channel FROM guilds WHERE guild_id = ${guildId}`)
      return musicChannel ? musicChannel.music_channel : null;
    } catch (e) {
      this.client.logger.error(e);
      return null;
    }
  }
  /**
   * Sets the music channel for a guild.
   * @param {string} guildId - The ID of the guild.
   * @param {string} channelId - The ID of the music channel.
   * @returns {Promise<void>} - A promise that resolves when the operation is complete.
   */
  async setMusicChannel(guildId: string, channelId: string): Promise<void> {
    try {
      await this.db.run(SQL`INSERT INTO guilds (guild_id, music_channel) VALUES (${guildId}, ${channelId})
      ON CONFLICT(guild_id) DO UPDATE SET music_channel = ${channelId}`);
    } catch (e) {
      this.client.logger.error(e);
    }
  }

  /**
   * Retrieves a map of guild IDs to their corresponding music channels.
   * @returns A promise resolving to a map of guild IDs to their corresponding music channels.
   * If an error occurs while fetching the data, the promise resolves to an empty map.
   */
  async getMusicChannels(): Promise<Map<string, string>> {
    try {
      const rows = await this.db.all<{ guild_id: string, music_channel: string }[]>(SQL`SELECT guild_id, music_channel FROM guilds`);
      const musicChannels = new Map<string, string>();
      for (const row of rows) {
        musicChannels.set(row.guild_id, row.music_channel);
      }
      return musicChannels;
    } catch (e) {
      this.client.logger.error(e);
      return new Map();
    }
  }
}