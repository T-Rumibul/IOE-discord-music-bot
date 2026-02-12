import type {Music} from './index.js';
import {EmbedField, GuildMember, Message, TextChannel} from 'discord.js';
import { VideoInfo, YtDlp } from 'ytdlp-nodejs'
import {youtube} from './regex.js';
import path from 'path';

const ytdlp = new YtDlp();
const chooseEmbedTemplate = {
  title: '',
  description: '',
  url: '',
  color: 8340425,
  image: {
    url: '',
  },
  author: {
    name: 'Выберите трек:',
    url: '',
  },
  fields: <EmbedField[]>[],
};

export class MusicYouTube {
  constructor(
    private music: Music,
  ) {}

//   async search(message: Message) {
//     try {
//       // const song = await Search(track, opts)
//       // if (song.results.length > 0) {
//       // 	return song.results;
//       // }
//       const search = await ytsr(message.content, {limit: 5});
//       const items = <ytsr.Video[]>(
//         search.items.filter(item => item.type === 'video')
//       );
//       if (!items || items.length === 0) {
//         const msg = await message.reply('Трек не найден.');
//         this.music.client.deleteMessageTimeout(msg, 5000);
//         return false;
//       }
//       const selectedTrack = await this.sendChooseMessage(
//         message.member!,
//         <TextChannel>message.channel,
//         items
//       );
//       if (selectedTrack === -1) return false;
//       return items[selectedTrack]?.url;
//     } catch (err) {
//       this.music.log('Youtube search error:', err);
//       return false;
//     }
//   }

  async getSong(message: Message) {
    try {
      let url: string | false = '';
      url = `https://www.youtube.com/watch?v=${message.content.match(
        youtube
      )?.[1]}`;
    //   this.music.trackSelection = true;
    //   if (!message.content.match(youtube)) url = await this.search(message);
      
      if (!url) return false;
      const song = {
        title: '',
        link: '',
        repeat: false,
        duration: '',
        thumbnail: '',
      };
      const cookiesFile = path.join(process.cwd(), 'cookies.txt')
      const videoDetails = await ytdlp.getInfoAsync(url, {
        cookies: cookiesFile
      }) as VideoInfo;
    
      song.title = videoDetails.title || '';
      song.link = videoDetails.original_url;
      song.duration = String(videoDetails.duration);
      song.thumbnail = videoDetails.thumbnails.pop()?.url || '';
      return song;
    } catch (e) {
      this.music.client.logger.error(e, 'YouTube');
      return false;
    }
  }

//   async sendChooseMessage(
//     member: GuildMember,
//     channel: TextChannel,
//     tracks: ytsr.Video[]
//   ): Promise<number> {
//     try {
//       const embed = JSON.parse(JSON.stringify(chooseEmbedTemplate));
//       let tracksCount = 0;
//       for (let i = 0; i < tracks.length; i += 1) {
//         if (i >= 5) break;
//         tracksCount += 1;

//         embed.description += `${i + 1}. **[${tracks[i]?.name}](${tracks[i]
//           ?.url})** \n`;
//       }

//       embed.fields[0] = {
//         name: '\u200B',
//         value: '`С или Cancel чтобы отменить.\n`',
//         inline: true,
//       };
//       const chooseMsg = await channel.send({
//         embeds: [embed],
//       });
//       const messageCollector = await channel.createMessageCollector();

//       const removeMsgAndCollector = async (id: NodeJS.Timeout) => {
//         try {
//           this.music.unBlockUser(member.id);
//           clearTimeout(id);
//           messageCollector.stop();
//           this.client.IOE.utils.deleteMessageTimeout(chooseMsg, 10);
//         } catch (e) {
//           this.music.log('Remove choose msg error:', e);
//         }
//       };
//       return await new Promise(resolve => {
//         const timeoutId = setTimeout(async () => {
//           await removeMsgAndCollector(timeoutId);
//           resolve(-1);
//         }, 30000);

//         messageCollector.on('collect', m => {
//           if (m.member?.user.id !== member.user.id) return;
//           if (m.author.bot) return;
//           this.client.IOE.utils.deleteMessageTimeout(m, 10);

//           switch (m.content.toLocaleLowerCase()) {
//             case '1':
//               resolve(0);
//               removeMsgAndCollector(timeoutId);
//               break;

//             case '2':
//               if (tracksCount < 1) break;
//               resolve(1);
//               removeMsgAndCollector(timeoutId);
//               break;

//             case '3':
//               if (tracksCount < 2) break;
//               resolve(2);
//               removeMsgAndCollector(timeoutId);
//               break;

//             case '4':
//               if (tracksCount < 3) break;
//               resolve(3);
//               removeMsgAndCollector(timeoutId);
//               break;
//             case '5':
//               if (tracksCount < 4) break;
//               resolve(4);
//               removeMsgAndCollector(timeoutId);
//               break;
//             case 'c':
//               resolve(-1);
//               removeMsgAndCollector(timeoutId);
//               break;
//             default:
//               break;
//           }
//         });
//       });
//     } catch (e) {
//       this.music.log('Choose track error:', e);
//       return -1;
//     }
//   }
}

export default MusicYouTube;
