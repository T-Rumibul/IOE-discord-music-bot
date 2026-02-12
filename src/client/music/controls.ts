import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  TextChannel,
} from 'discord.js';
import type {Music} from './index.js';

const togglePause = new ButtonBuilder()
  .setCustomId('togglePause')
  .setEmoji(':Play:1233628592995565620')
  .setStyle(ButtonStyle.Primary);

const stop = new ButtonBuilder()
  .setCustomId('stop')
  .setLabel('Stop')
  .setStyle(ButtonStyle.Danger);

const next = new ButtonBuilder()
  .setCustomId('next')
  .setLabel('Next')
  .setStyle(ButtonStyle.Primary);

const repeat = new ButtonBuilder()
  .setCustomId('repeat')
  .setLabel('Repeat')
  .setStyle(ButtonStyle.Primary);

const shuffle = new ButtonBuilder()
  .setCustomId('shuffle')
  .setLabel('Shuffle')
  .setStyle(ButtonStyle.Primary);
const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  togglePause,
  stop,
  next,
  repeat,
  shuffle
);

export class MusicControls {
  interactionTimeout = new Set();
  constructor(
    private music: Music,
  ) {}

  async initControlls(guildId: string) {
    try {
      const msg = await this.music.display.getMessage(guildId)
      if (!msg) return;

      msg?.channel.send({
        content: '',
        components: [row],
      });
    } catch (e) {
      this.music.client.logger.error(e);
    }
  }
  private async setInteractionTimeout(
    interaction: ButtonInteraction,
    time: number
  ) {
    this.interactionTimeout.add(interaction.guildId);

    setTimeout(() => {
      this.interactionTimeout.delete(interaction.guildId);
      if (!interaction.replied) interaction.update({});
    }, time);
  }

  private async sendTimeoutWarning(channel: TextChannel) {
    try {
      const warning = await channel?.send({
        embeds: [
          {
            description:
              '❌ **Пожалуйста, дождитесь 1 секунды перед следующим нажатием кнопки. Нажимайте кнопку менее часто, пожалуйста.**',
            color: 8340425,
          },
        ],
      });
      setTimeout(() => warning?.delete(), 1000);
    } catch (e) {
      this.music.client.logger.error(e);
    }
  }
  async interactionHandler(interaction: ButtonInteraction) {
    try {
      const id = interaction.customId;
      const guildId = interaction.guildId!;

      if (this.interactionTimeout.has(guildId)) {
        this.sendTimeoutWarning(<TextChannel>interaction.channel);
        return;
      }

      const player = await this.music.player.get(guildId);
      if (!player) return;

      switch (id) {
        // Resume
        case 'togglePause':
          this.setInteractionTimeout(interaction, 100);
          if (player.state.status === 'playing') player.pause();
          else player.unpause();
          break;

        // Stop
        case 'stop':
          this.setInteractionTimeout(interaction, 100);
          this.music.player.stop(guildId);
          break;

        // Next
        case 'next':
          this.setInteractionTimeout(interaction, 150);
          await this.music.queue.nextSong(guildId, true);
          break;
        // Repeat
        case 'repeat':
          this.setInteractionTimeout(interaction, 1500);
          const enabled = await this.music.queue.toggleRepeat(guildId);
          repeat.setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Primary);
          interaction.update({
            components: [row],
          });
          break;

        case 'shuffle':
          this.setInteractionTimeout(interaction, 1000);
          this.music.queue.shuffle(guildId);
          break;

        default:
          break;
      }
    } catch (e) {
      this.music.client.logger.error(e);
    }
  }
}

export default MusicControls;
