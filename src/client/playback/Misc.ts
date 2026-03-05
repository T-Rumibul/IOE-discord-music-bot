import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild } from "discord.js";
import { checkFileURL } from "../../utils/index.js";
import { getConfig } from "../../config.js";
import type { GuildQueue } from "./PlayerQueue.js";

const config = getConfig()
const togglePauseBtn = new ButtonBuilder()
    .setCustomId('togglePause')
    .setEmoji(':Play:1233628592995565620')
    .setStyle(ButtonStyle.Primary);

const stopBtn = new ButtonBuilder()
    .setCustomId('stop')
    .setLabel('Stop')
    .setStyle(ButtonStyle.Danger);

const nextBtn = new ButtonBuilder()
    .setCustomId('next')
    .setLabel('Next')
    .setStyle(ButtonStyle.Primary);

const repeatBtn = new ButtonBuilder()
    .setCustomId('toggleRepeat')
    .setLabel('Repeat')
    .setStyle(ButtonStyle.Primary);

const shuffleBtn = new ButtonBuilder()
    .setCustomId('shuffle')
    .setLabel('Shuffle')
    .setStyle(ButtonStyle.Primary);

export const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    togglePauseBtn,
    stopBtn,
    nextBtn,
    repeatBtn,
    shuffleBtn
);



type EmbedField = {
    name: string;
    value: string;
    inline: true;
};
const playGIF = (await checkFileURL(`${config.HOST}:${config.PORT}/music_playing.gif`)) ? `https://${config.HOST}:${config.PORT}/music_playing.gif` : config.PLAYER_GIF_PLAYING
const idleGIF = (await checkFileURL(`${config.HOST}:${config.PORT}/idle.gif`)) ? `https://${config.HOST}:${config.PORT}/idle.gif` : config.PLAYER_GIF_IDLE
const embedTemplate = {
    title: '',
    description: '',
    url: '',
    color: 8340425,
    image: {
        url: playGIF,
    },
    author: {
        name: 'Now playing:',
        url: '',
    },
    fields: <EmbedField[]>[],
};


export const generateEmbed = async (playerQueue: GuildQueue, paused = false) => {
    const currentItem = playerQueue.current;
    const embed = { ...embedTemplate };
    embed.title = `${paused ? '[Paused]' : ''} **${currentItem?.title}** [@${currentItem?.requestedBy.user.username}] ${currentItem?.repeat ? '(🔁)' : ''}`;
    const desc = []
    const maxItems = 6;
    const queue = playerQueue.queue;
    for (let i = 0; i < queue.length; i++) {
        if (i >= maxItems) {
            desc.push(`${queue.length - i} More...`);
            break;
        }

        const item = queue[i];
        desc.push(`${i + 1}. **${item.title}** [@${item?.requestedBy?.user?.username}]`);
    }

    embed.description = desc.join('\n');
    embed.image.url = paused ? idleGIF : playGIF;
    return embed;
}