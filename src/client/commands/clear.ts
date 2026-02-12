import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandNumberOption,
} from 'discord.js';

const command = new SlashCommandBuilder();
command.setName('clear');
command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
command.setDescription('Deletes selected amount of messages');
command.setDescriptionLocalizations({
  ru: 'Удаляет выбранное количество сообщение в текущем канале',
});
const numberOption = new SlashCommandNumberOption();
numberOption.setMinValue(1);
numberOption.setMaxValue(100);
numberOption.setAutocomplete(true);
numberOption.setDescription('Number of messages to delete');
numberOption.setDescriptionLocalizations({
  ru: 'Сколько сообщений удалить',
});
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

    await interaction.reply(`Удалено **${deleted.size}** сообщений.`);
    // client.utils.deleteMessageTimeout(resp, 5000)
  } catch (e) {
    client.logger.error(e, 'Clear command error');
  }
}

export default defineCommand(
  command,
  execute,
);
