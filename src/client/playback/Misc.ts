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

async function imageExists(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { method: "HEAD" });
        return !!(response.ok &&
            response.headers.get("content-type")?.startsWith("image/"));
    } catch {
        return false;
    }
}
export const generateEmbed = async (playerQueue: GuildQueue, paused = false) => {
    const currentItem = playerQueue.current;
    const embed = { ...embedTemplate };
    embed.title = `${paused ? '[Paused]' : ''} **${currentItem?.title}** [@${currentItem?.requestedBy.username}] ${currentItem?.repeat ? '(🔁)' : ''}`;
    const desc = []
    const maxItems = 6;
    const queue = playerQueue.queue;
    for (let i = 0; i < queue.length; i++) {
        if (i >= maxItems) {
            desc.push(`${queue.length - i} More...`);
            break;
        }

        const item = queue[i];
        desc.push(`${i + 1}. **${item.title}** [@${item.requestedBy.username}]`);
    }

    embed.description = desc.join('\n');
    switch (currentItem?.type) {
        case 'url':
            const imageURL: string[] | undefined[] = [currentItem.thumbnail];
            // Max resolution thumbnail is usually the last one in the array, so we reverse it to check from highest to lowest resolution.
            for (const entry of [...currentItem.videoData.thumbnails].reverse()) {
                imageURL.push(entry.url);
            }
            let embedImageURL: string | undefined;
            for (const url of imageURL) {
                if (url && await imageExists(url)) {
                    embedImageURL = url;
                    break;
                }
            }
            if (embedImageURL) {
                embed.image.url = embedImageURL;
            } else {
                embed.image.url = paused ? idleGIF : playGIF;
            }
            break;
        case 'attachment':
            embed.image.url = paused ? idleGIF : playGIF;
            break;
    }
    return embed;
}