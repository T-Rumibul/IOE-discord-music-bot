import type { Guild, GuildMember, Message, TextChannel } from 'discord.js'
import { ChannelType, Client, IntentsBitField, PermissionFlagsBits } from 'discord.js';

import { logger, sleep } from '../utils/index.js'
import { IOEClientEvents } from './IOEClientEvents.js';
import { IOEClientDatabase } from './IOEClientDatabase.js';
import { IOECLientCommands } from './IOEClientCommands.js';
export class IOEClient extends Client {
  private eventsHandler = new IOEClientEvents(this);
  commands = new IOECLientCommands(this);
  public logger = logger;
  public db = new IOEClientDatabase(this);
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
    this.logger.info('IOEClient initialized.');
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
    return await super.login();
    
  }
  /**
   * Checks if a member has the administrator permission or any of the roles specified in `adminRoles`.
   * @param {GuildMember} member - The member to check.
   * @returns {boolean} True if the member is an administrator, false otherwise.
   */
  isAdmin(member: GuildMember) {
    if (this.isOwner(member)) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator, true)) {
      return true;
    }
    const adminRoles: unknown[] = [];
    if (adminRoles.length > 0) {
      if (member.roles.cache.find(r => adminRoles.indexOf(r.id) !== -1)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Checks if a member has the moderator role or any of the roles specified in `modRoles`.
   * @param {GuildMember} member - The member to check.
   * @returns {boolean} True if the member is a moderator, false otherwise.
   */
  isMod(member: GuildMember) {
    const modRoles: unknown[] = [];
    if (this.isAdmin(member)) return true;
    if (modRoles.length > 0) {
      if (member.roles.cache.find(r => modRoles.indexOf(r.id) !== -1)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Checks if a member is the owner of the guild.
   * @param {GuildMember} member - The member to check.
   * @returns {boolean} True if the member is the owner, false otherwise.
   */
  isOwner(member: GuildMember) {
    if (member.id === member.guild.ownerId) {
      return true;
    }
    return false;
  }

  /**
   * Gets a guild member from a mention string.
   * @param {string} mention - The mention string to parse the member ID from.
   * @param {Guild} guild - The guild to fetch the member from.
   * @returns {Promise<GuildMember | null>} The guild member if found, null otherwise.
   */
  async getMemberFromMentions(mention: string, guild: Guild) {
    try {
      const usedID = mention.replace(/([^0-9])+/g, '');
      const member = await guild.members.fetch(usedID);
      return member;
    } catch {
      return null;
    }
  }

  /**
   * Gets a guild text channel from a mention string.
   * @param {string} mention - The mention string to parse the channel ID from.
   * @param {Guild} guild - The guild to fetch the channel from.
   * @returns {Promise<TextChannel | null>} The guild text channel if found, null otherwise.
   */
  async getChannelFromMentions(mention: string, guild: Guild) {
    try {
      const channelID = mention.replace(/([^0-9])+/g, '');
      const channel = await guild.channels.fetch(channelID);
      if (channel && channel.type !== ChannelType.GuildText) return null;
      return channel;
    } catch {
      return null;
    }
  }
  /**
   * Deletes a message after a specified timeout.
   * @param {Message} message - The message to delete.
   * @param {number} timeout - The timeout in milliseconds.
   */
  async deleteMessageTimeout(message: Message, timeout: number) {
    setTimeout(async () => {
      try {
        if (!message || message.channel.type !== ChannelType.GuildText) return;
        const msg = await message.channel.messages.cache.get(message.id);
        if (!msg) return;
        if (msg.deletable) {
          msg.delete();
        }
      } catch (e) {
        logger.error(`Message delete error`);
        logger.error(e);
      }
    }, timeout);
  }

  /**
   * Deletes all messages in a channel.
   * If the bulkDelete fails, it will delete messages one by one.
   * @param {TextChannel} channel - The channel to delete messages from.
   * @returns {Promise<void>}
   */
  async deleteAllMessages(channel: TextChannel) {
    try {
      await channel.bulkDelete(
        (
          await channel.messages.fetch({
            cache: true,
          })
        ).size
      );
    } catch (err) {
      // Try to delete messages one by one if bulkDelete fails
      const messagesCollection = await channel.messages.fetch({
        cache: true
      })
      const messages = messagesCollection.values()
      for (let msg of messages) {
        if (msg.deletable) await msg.delete()
        else {
          await channel.send(
            '⚠ **Message deletion failed**'
          );
          return;
        }
        await sleep(1);
      }
    }
  }
}