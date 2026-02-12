import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

const command = new SlashCommandBuilder();
command.setName('invite');
command.setDescription('Create an invite link to add bot to your server');
command.setDescriptionLocalizations({
  ru: 'Создает ссылку для добавления бота на свой сервер',
});
async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
  
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;
    await interaction.reply(
      `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot`
    );
    // client.utils.deleteMessageTimeout(resp, 5000)
  } catch (e) {
    client.logger.error(e, 'Invite command error');
  }
}

export default defineCommand(
  command,
  execute,
);
