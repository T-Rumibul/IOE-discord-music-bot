import type { GuildMember, GuildTextBasedChannel, Message, } from 'discord.js'
import { ChannelType, Client, IntentsBitField } from 'discord.js';

import { logger } from '../utils/index.js'
import { IOEClientEvents } from './IOEClientEvents.js';
import { IOEClientDatabase } from './IOEClientDatabase.js';
import { IOEClientCommands } from './IOEClientCommands.js';
import { IOEClientPlayback } from './IOEClientPlayback.js';
export class IOEClient extends Client {
  private readonly eventsHandler = new IOEClientEvents(this);
  public readonly commands = new IOEClientCommands(this);
  public readonly player = new IOEClientPlayback(this);
  public readonly db = new IOEClientDatabase();
  /**
   * Constructs an instance of the IOEClient class.
   * @remarks
   * Intents are set to the following:
   * - Guilds: Enables the caching and retrieval of guild objects.
   * - GuildMessages: Enables the caching and retrieval of guild messages.
   * - GuildVoiceStates: Enables the caching and retrieval of guild voice states.
   * - GuildMessageReactions: Enables the caching and retrieval of guild message reactions.
   * - MessageContent: Enables the bot to receive message content.
  */
  constructor(public clientId: string, token: string) {
    super({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.MessageContent,
      ],
    });

    this.token = token;
    logger.info('IOEClient initialized.');
  }
  /**
   * A hook that is called before the bot logs in.
   * This can be used to perform any necessary setup or initialization before the bot starts.
   * @async
   * @returns {Promise<void>}
   */
  private async beforeLogin() {
    await this.eventsHandler.registerEvents();
    await this.commands.load();
  }
  public async login(): Promise<string> {
    await this.beforeLogin();
    return super.login();
  }
  /**
   * Deletes a message after a specified timeout.
   * @param {Message} message - The message to delete.
   * @param {number} timeout - The timeout in milliseconds.
   */
  deleteMessageTimeout(message: Message, timeout: number) {
    setTimeout(async () => {
      try {
        if (message.channel.type !== ChannelType.GuildText) return;
        if (message.deletable) {
          await message.delete();
        }
      } catch (e) {
        logger.error(e, `Message delete error:`);
      }
    }, timeout);
  }
  /**
   * Sends a mention to a guild member in a guild text channel.
   * The mention is sent as a message with the content specified.
   * If a timeout is specified, the message will be deleted after the timeout.
   * @param {GuildTextBasedChannel} channel - The channel to send the mention to.
   * @param {string} content - The content of the message to send.
   * @param {GuildMember} member - The guild member to mention.
   * @param {number} [timeout] - The timeout in milliseconds.
   */
  async sendMention(channel: GuildTextBasedChannel, content: string, member: GuildMember, timeout?: number) {
    try {
      const msg = await channel.send(`<@${member.id}>, ${content}`);
      if (timeout) {
        this.deleteMessageTimeout(msg, timeout);
      }
    } catch (e) {
      logger.error(e, `Error sending mention in guild ${channel.guild.name}`);
    }
  }
}