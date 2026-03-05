import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import path from 'path';
import { getConfig } from '../../config.js';
import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import { DownloadManagerSingleton } from '../../misc/DownloadManager.js';
import { createAccessKey } from '../../server.js';
const config = getConfig();
const downloadManager = DownloadManagerSingleton();

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



const downloadsDir = path.join(process.cwd(), config.DOWNLOADS_FOLDER);
async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    const URL = interaction.options.getString('query')
    if (!URL) {
      await interaction.reply('No URL provided');
      return;
    }
    await interaction.reply({ content: 'Processing your request...', flags: MessageFlags.Ephemeral });
    const downloadedFiles = await downloadManager.download(URL, 'video');
    if (!downloadedFiles) {
      await interaction.editReply({ content: 'Failed to download the video. Please make sure the URL is correct and try again.'});
      return;
    }
    const key = createAccessKey(60* 60 * 1000, downloadedFiles.filename)
    await interaction.editReply({ content: `Video downloaded successfully: ${config.HOST}:${config.PORT}/downloads/${encodeURIComponent(downloadedFiles.filename)}?key=${key}` });
    
  } catch (e) {
    client.logger.error(e, 'Error executing play command');
  }
}

export default defineCommand(
  command,
  execute,
  {
    disabled: config.DOWNLOADS_COMMAND_DISABLED
  }
);
