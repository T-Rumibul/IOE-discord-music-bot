import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandAttachmentOption,
  SlashCommandBuilder,
  SlashCommandNumberOption,
} from 'discord.js';

const command = new SlashCommandBuilder();
command.setName('clear');
command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
command.setDescription('Deletes selected amount of messages');
const numberOption = new SlashCommandNumberOption();
numberOption.setMinValue(1);
numberOption.setMaxValue(100);
numberOption.setAutocomplete(true);
numberOption.setDescription('Number of messages to delete');
numberOption.setName('number').setRequired(true);
command.addNumberOption(numberOption);

async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    const {channel} = interaction;
    const amount = interaction.options.get('number', true).value;
    if (typeof amount !== 'number') return;

    const deleted = await channel.bulkDelete(Number(amount), true);

    await interaction.reply({ content: `Removed **${deleted.size}** messages.`, ephemeral: true });
  } catch (e) {
    client.logger.error(e, 'Clear command error');
  }
}

export default defineCommand(
  command,
  execute,
);
