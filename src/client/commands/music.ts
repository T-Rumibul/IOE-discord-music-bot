import { defineCommand } from '../IOEClientCommands.js';
import type {IOEClient} from '../IOEClient.js';
import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandChannelOption,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
} from 'discord.js';

const command = new SlashCommandBuilder();
command.setName('music');
command.setDescription('Commands to setup music module');
command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const channelSubcommandGroup = new SlashCommandSubcommandGroupBuilder();
channelSubcommandGroup.setName('channel');
channelSubcommandGroup
  .setDescription(
    'Channel for processing text input for music module and also for message with controll buttons'
  )
  .setDescriptionLocalizations({
    ru: 'Канал с кнопками для управления музыкой, а также поиск и выбор треков.',
  })
  .addSubcommand(
    new SlashCommandSubcommandBuilder()
      .setName('set')
      .setDescription('Choose channel for music module')
      .setDescriptionLocalizations({
        ru: 'Выбрать канал для музыкального модуля',
      })
      .addChannelOption(
        new SlashCommandChannelOption()
          .setName('channel')
          .setDescription('Choose empty text channel')
          .setDescriptionLocalizations({
            ru: 'Выберите пустой текстовый канал',
          })
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  );
command.addSubcommandGroup(channelSubcommandGroup);

const musicSubCommand = new SlashCommandSubcommandBuilder();
musicSubCommand.setName('info');
musicSubCommand.setDescription('Info about music module');
musicSubCommand.setDescriptionLocalizations({
  ru: 'Информация о музыкальном модуле',
});
command.addSubcommand(musicSubCommand);
async function execute(
  client: IOEClient,
  interaction: ChatInputCommandInteraction
  
) {
  try {
    if (interaction.channel?.type !== ChannelType.GuildText) return;

    if (
      interaction.options.getSubcommandGroup() === 'channel' &&
      interaction.options.getSubcommand() === 'set'
    ) {
      const channel = <GuildTextBasedChannel>(
        interaction.options.getChannel('channel', true)
      );
      if (channel.type !== ChannelType.GuildText) return;

      await interaction.deferReply({ephemeral: true})
      const {guildId} = interaction;
      if (!guildId) return;
      
     const result = await client.db.setMusicChannel(guildId, channel.id);

      await interaction.editReply(
        `Новый канал для плеера: <#${(
          await client.db.getMusicChannel(guildId)
        )}>`
      );
      

      
    }
  } catch (e) {
    client.logger.error(e, 'Music command error');
  }
}

export default defineCommand(
  command,
  execute,
);
