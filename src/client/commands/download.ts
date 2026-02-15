import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import path from 'path';

const command = new SlashCommandBuilder();
command.setName('download');
command.setDescription('Downloads a video from various platforms');


const querySubCommand = new SlashCommandSubcommandBuilder();
const queryOption = new SlashCommandStringOption();
queryOption.setName('query');
queryOption.setDescription('The URL');
queryOption.setRequired(true);

querySubCommand.setName('youtube');
querySubCommand.setDescription('Download a video from YouTube');
querySubCommand.addStringOption(queryOption);

command.addSubcommand(querySubCommand);



const downloadsDir = path.join(process.cwd(), 'downloads_temp')
async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    const {channel, member, guild} = interaction;
    const URL = interaction.options.getString('query')
    if (!URL) {
      await interaction.reply('No URL provided');
      return;
    }
    await interaction.reply({ content: 'Processing your request...', flags: MessageFlags.Ephemeral });
    const downloadedFiles = await client.player.download(URL, downloadsDir);
    if (!downloadedFiles) {
      await interaction.editReply({ content: 'Failed to download the video. Please make sure the URL is correct and try again.'});
      return;
    }
    console.log(downloadedFiles)
    
  } catch (e) {
    client.logger.error(e, 'Error executing play command');
  }
}

export default defineCommand(
  command,
  execute,
  {
    disabled: process.env.DOWNLOADS_COMMAND_ENABLED !== 'true'
  }
);
