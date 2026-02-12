import { EmbedBuilder } from 'discord.js';
import type { Music } from './index.js';


type EmbedField = {
  name: string;
  value: string;
  inline: true;
};
const embedTemplate = {
  title: '',
  description: '',
  url: '',
  color: 8340425,
  image: {
    url: 'https://media.discordapp.net/attachments/716045712583950376/1233671883854188576/Nt6v.gif?ex=662df1f9&is=662ca079&hm=a59076687a8923c4b6583020997110dac20a1564c1d3764cf766d12dab1feab6&=&width=825&height=511',
  },
  author: {
    name: 'Сейчас проигрывается:',
    url: '',
  },
  fields: <EmbedField[]>[],
};

export class MusicDisplay {
  constructor(
    private music: Music,
    // Map <GuildID, MessageID>
    private displayMessagesIDs: Map<string, string> = new Map()
  ) { }
  async subscribeToEvents() {
    this.music.queue.on('setGuildQueue', async guildId => {
      this.updateMessage(guildId);
    });
  }
  async getMessage(guildID: string) {
    const messageID = this.displayMessagesIDs.get(guildID);
    if (!messageID) return null;
    const channel = await this.music.getChannel(guildID);
    if (!channel) return null;
    const message = await channel?.messages.fetch({
      message: messageID,
    });
    return message;
  }
  async sendMessage(guildID: string) {
    try {
      const channel = await this.music.getChannel(guildID);
      if (!channel) return null;
      if (
        (
          await channel.messages.fetch({
            cache: true,
          })
        ).size > 60
      ) {
        await channel.send(
          'Канал содержит более 60 сообщений, выберите другой канал для музыки.'
        );
        return null;
      }
      await this.music.client.deleteAllMessages(channel);
      const embed = new EmbedBuilder(embedTemplate);
      const displayMessage = await channel.send({
        embeds: [embed],
      });
      this.displayMessagesIDs.set(channel.guildId, displayMessage.id);
      this.updateMessage(channel.guildId);
      await this.subscribeToEvents();
      return displayMessage;
    } catch (e) {
      this.music.client.logger.error(e);
      return null;
    }
  }

  async updateMessage(guildId: string) {
    try {
      let msg = await this.getMessage(guildId);
      if (!msg || !msg.editable) {
        msg = await this.sendMessage(guildId);
      }
      if (!msg) return null;
      const newEmbed = JSON.parse(JSON.stringify(embedTemplate));
      const queue = await this.music.queue.get(guildId);
      if (queue.length === 0) {
        const empty = new EmbedBuilder();
        empty.setImage(
          'https://media.discordapp.net/attachments/716045712583950376/1233671796314869770/f57f4e47c4faab3ea7b357a85910a80b.gif?ex=662df1e4&is=662ca064&hm=cd0f5687bf9ac723fea38c86f2a282852ef532278e137d32cd8f0f522425bcf9&=&width=542&height=515'
        );
        empty.setTitle(
          'Загрузите аудио/видео файл, предоставьте ссылку на YouTube/Spotify, или введите текстовый запрос для поиска на YouTube.'
        );
        const newMsg = await msg.edit({
          embeds: [empty],
        });
        this.displayMessagesIDs.set(guildId, newMsg.id);
        return newMsg;
      }
      for (let i = 0; i < queue.length; i += 1) {
        const song = queue[i];
        if (!song) break;
        if (i === 0) {
          newEmbed.title = `[${song.duration}] ${song.title}`;
          if (song.repeat) newEmbed.title = `🔁 ${newEmbed.title}`;

          newEmbed.url = song.link;
          // newEmbed.image.url = song.thumbnail;
        }
        if (i < 11 && i > 0) {
          newEmbed.description += `${i}. **[[${song.duration}] ${song.title}](${song.link})** \n`;
        } else if (i >= 11) {
          newEmbed.fields[0] = {
            name: '\u200B',
            value: '\u200B',
            inline: true,
          };
          newEmbed.fields[0].value = ` ...Еще ${queue.length - i}`;
          break;
        }
      }

      const newMsg = await msg.edit({
        embeds: [newEmbed],
      });

      this.displayMessagesIDs.set(guildId, newMsg.id);
      return newMsg
    } catch (e) {
      this.music.client.logger.error(e);
      return null
    }
  }
}

export default MusicDisplay;
