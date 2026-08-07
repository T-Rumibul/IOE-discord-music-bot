import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandAttachmentOption,
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  MessageFlags
} from 'discord.js';
import { logger } from '../../utils/index.js';

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
const gotoSubCommand = new SlashCommandSubcommandBuilder();
const gotoOption = new SlashCommandStringOption();
gotoOption.setName('goto');
gotoOption.setDescription('Go to a specific time in the song');
gotoOption.setRequired(false);

gotoSubCommand.setName('goto');
gotoSubCommand.setDescription('Go to a specific time in the song');
gotoSubCommand.addStringOption(gotoOption);

command.addSubcommand(gotoSubCommand);
command.addSubcommand(attachmentSubCommand);
command.addSubcommand(querySubCommand);

async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.reply('This command can only be used in a guild text channel.');
      return;
    };
    const subcommand = interaction.options.getSubcommand();
    const data = interaction.options.getString('query') || interaction.options.getAttachment('file') || interaction.options.getString('goto');
    if (!data) {
      if (subcommand === 'goto') {
        await interaction.reply('Please provide a time to go to');
        return;
      }
      await interaction.reply('No query or file provided');
      return;
    }

    if(subcommand === 'goto') {
      await interaction.reply({ content: `Going to ${data} in the song...`, flags: MessageFlags.Ephemeral });
      await client.player.goto(interaction, data as string);
      return;
    }
    await interaction.reply('Processing your request...')
    await client.player.play(interaction, data);
    
  } catch (e) {
    logger.error(e, 'Error executing play command');
  }
}

export default defineCommand(
  command,
  execute,
);
