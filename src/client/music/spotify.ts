import type {Message} from 'discord.js';

import type {Music} from './index.js';

export class MusicSpotify {
  constructor(
    private music: Music,
  ) {}

  async getSong(message: Message) {
    try {
      // This will check if access token has expired or not. If yes, then refresh the token.
      // if (ytdl.is_expired()) await ytdl.refreshToken();

      // const spotifyData = await ytdl.spotify(message.content);
      // const searched = await ytdl.search(`${spotifyData.name}`, {
      //   limit: 1,
      // });
      // if (!searched[0]) return false;
      // const [videoDetails] = searched;
      const song = {
        title: '',
        link: '',
        repeat: false,
        duration: '',
        thumbnail: '',
      };
      // song.title = videoDetails.title || '';
      // song.link = videoDetails.url;
      // song.duration = videoDetails.durationRaw;
      // song.thumbnail = videoDetails.thumbnails.pop()?.url || '';
      return song;
    } catch (e) {
      this.music.client.logger.error(e);
      return false;
    }
  }
}
export default MusicSpotify;
