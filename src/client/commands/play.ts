import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandAttachmentOption,
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';

const command = new SlashCommandBuilder();
command.setName('play');
command.setDescription('Plays a song in a voice channel');

const attachmentSubCommand = new SlashCommandSubcommandBuilder();
const attachmentOption = new SlashCommandAttachmentOption();
attachmentOption.setName('file');
attachmentOption.setDescription('Audio or video file to play');
attachmentOption.setRequired(true);

attachmentSubCommand.setName('file');
attachmentSubCommand.setDescription('Play a song from a file');
attachmentSubCommand.addAttachmentOption(attachmentOption);

const querySubCommand = new SlashCommandSubcommandBuilder();
const queryOption = new SlashCommandStringOption();
queryOption.setName('query');
queryOption.setDescription('The URL or search query of the song to play');
queryOption.setRequired(true);

querySubCommand.setName('query');
querySubCommand.setDescription('Play a song from a search query or URL');
querySubCommand.addStringOption(queryOption);

command.addSubcommand(attachmentSubCommand);
command.addSubcommand(querySubCommand);

async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    const {channel, member, guild} = interaction;
    const data = interaction.options.getString('query') || interaction.options.getAttachment('file');
    if (!data) {
      await interaction.reply('No query or file provided');
      return;
    }
    const memberid = member?.user.id;
    const guildMember = guild?.members.cache.get(memberid || '');
    if (!guildMember) {
      await interaction.reply('Something went wrong. Please try again later');
      return;
    }
    const resp = await interaction.reply('Processing your request...');
    
    await client.player.play(guildMember, channel, data)
    
  } catch (e) {
    client.logger.error(e, 'Error executing play command');
  }
}

export default defineCommand(
  command,
  execute,
);
