import type {IOEClient} from '../IOEClient.js';
import type {
  Message,
  Interaction,
  ButtonInteraction,
  TextChannel,
} from 'discord.js';
import {
  ChannelType,
} from 'discord.js';

import dotenv from 'dotenv';

import type {Song} from './queue.js';
import {MusicYouTube} from './youtube.js';
import {MusicSpotify} from './spotify.js';
import {MusicControls} from './controls.js';
import {MusicDisplay} from './display.js';
import {MusicQueue} from './queue.js';
import {MusicPlayer} from './player.js';
import {MusicAttachments} from './attachments.js';

dotenv.config();

export class Music {
  /**
   * Map of guild IDs and music channel IDs
   *
   * @type {Map<string, string>}
   */
  channels!: Map<string, string>;
  
  trackSelection: boolean = false;
  /**
   * @class
   * @param {IOEClient} client - The IOEClient instance
   */
  constructor(public client: IOEClient) {
  }
  youtube = new MusicYouTube(this);

  attachments = new MusicAttachments(this);

  spotify = new MusicSpotify(this);

  controls = new MusicControls(this);

  display = new MusicDisplay(this);

  queue = new MusicQueue(this);

  player = new MusicPlayer(this);
  /**
   * Overrides the Base class's init method and initializes the music module
   *
   * @async
   */
  async init() {
    try {
      // Get music channels from externalDB
      this.channels = await this.client.db.getMusicChannels();

      // Loop through each music channel and display message
      this.channels.forEach(async (channelId: string, guildId: string) => {
        // Fetch guild
        const guild = await this.client.guilds.fetch(guildId);

        // If guild not found, return
        if (!guild) return;

        // Fetch channel
        const channel = await guild.channels.fetch(channelId);

        // If channel not found or not a text channel, return
        if (!channel || channel.type !== ChannelType.GuildText) return;

        // Send display message
        await this.display.sendMessage(guildId);
        //Create buttons
        await this.controls.initControlls(guildId);
      });

      // Listen for next song event in queue and update display message
      this.queue.on('nextSong', async ([queue, guildId]) => {
        await this.player.next(guildId);
      });

      // Listen for empty event in queue to stop player
      this.queue.on('empty', async ([guildId]) => {
        this.player.stop(guildId);
      });

      // Listen for idle event in player and trigger next song in queue
      this.player.on('idle', async ([player, guildId]) => {
        await this.queue.nextSong(guildId);
      });

      // Listen for player error and log the error
      this.player.on('error', ([player, guildId, e]) => {
        this.client.logger.error(e, `Music player error in guild ${guildId}`);
      });

      this.client.logger.info('Initialization completed.');
    } catch (error) {
      this.client.logger.error(error, `Music module initialization error`);
    }
  }
  /**
   * Fetches coresponding music channel.
   *
   * @returns {Promise<TextChannel>}
   */
  async getChannel(guildID: string) {
    try {
      const musicChannelID = this.channels.get(guildID);
      if (!musicChannelID) return null;
      const guild = await this.client.guilds.fetch({
        guild: guildID,
      });
      const channel = await guild.channels.fetch(musicChannelID);
      return <TextChannel>channel;
    } catch (e) {
      this.client.logger.error(e, `Get music channel error in guild ${guildID}`);
      return null;
    }
  }
  async setChannel(guildID: string, channelID: string) {
    const guild = await this.client.guilds.fetch({
      guild: guildID,
    });
    if (!guild) return null;
    const channel = await guild.channels.fetch(channelID);
    if (!channel) return null;
    this.channels.set(guildID, channelID);
    await this.client.db.setMusicChannel(guildID, channelID)
    await this.display.sendMessage(guildID);
    await this.controls.initControlls(guildID);

    return channelID;
  }

  /**
   * Updates the music channels by fetching them from the database.
   *
   * @returns {Promise<void>}
   */
  async updateMusicChannels() {
    this.client.logger.debug(this.channels, 'Updating music channels...');
    this.channels = await this.client.db.getMusicChannels();
  }

  async interaction(interaction: Interaction) {
    try {
      if (interaction.channelId === this.channels.get(interaction.guildId!))
        this.controls.interactionHandler(<ButtonInteraction>interaction);
    } catch (e) {
      this.client.logger.error(e, `Music interaction error in guild ${interaction.guildId}`);
    }
  }
  /**
   * Plays a song based on the message contents.
   *
   * @param {Message} message - The message object sent by the user.
   * @returns {Promise<void>}
   */
  async play(message: Message) {
    // Check if the message is sent from a text channel
    if (message.channel.type !== ChannelType.GuildText) return;
    if (this.trackSelection) return;
    try {
      // Check if the message is sent from the music channel
      // if (message.channelId !== this.channels.get(message.guildId!)) return;

      // Check if the message author is in a voice channel
      if (!message.member?.voice.channel) {
        const msg = await message.channel.send({
          embeds: [
            {
              description: '❌ **Вы должны находиться в голосовом канале!**',
              color: 8340425,
            },
          ],
        });
        this.client.deleteMessageTimeout(msg, 5000);
        this.client.deleteMessageTimeout(message, 5000);
        return;
      }

      let song: Song | false;

      // Check if the URL is a Spotify track or a YouTube video
      // const validateUrl = await ytdl.validate(message.content);
      // if (validateUrl === 'sp_track')
      //   song = await this.spotify.getSong(message);
      // else if (message.content.length === 0 && message.attachments.size > 0)
      //   song = await this.attachments.getSong(message);
      song = await this.youtube.getSong(message);

      const {guildId} = message;

      if (!song) {
        // Delete the original message
        this.client.deleteMessageTimeout(message, 1000);
        return;
      }

      // Add the song to the queue
      await this.queue.add(song, guildId!);

      // If the player is already playing, return
      if (await this.player.isPlaying(guildId!)) {
        // Delete the original message
        this.client.deleteMessageTimeout(message, 1000);
        return;
      }

      // Start playing the song
      await this.player.start(
        guildId!,
        message.member.voice.channelId!,
        message.guild!.voiceAdapterCreator
      );
      // Delete the original message
      this.client.deleteMessageTimeout(message, 1000);
    } catch (e) {
      this.client.logger.error(e, `Play music error in guild ${message.guildId}`);
    }
  }
}

let instance: Music;

/**
 * Creates an instance of Music.
 *
 * @param {IOEClient} client - The IOEClient instance
 */
export function music(client: IOEClient) {
  if (!instance) instance = new Music(client);

  return instance;
}

export default music;
