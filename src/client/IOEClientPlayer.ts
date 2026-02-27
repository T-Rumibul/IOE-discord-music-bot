import type { Attachment, GuildMember, GuildTextBasedChannel } from "discord.js";
import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, StreamType } from "@discordjs/voice";
import { VideoInfo } from "ytdlp-nodejs";
import { regexYoutube, YTDLP } from "../utils/index.js";
import { IOEClient } from "./IOEClient.js";
import { shuffle } from "../utils/index.js";
type QueueItem = {
    url: string;
    title: string;
    requestedBy: GuildMember;
    requestChannelId: string;
    repeat: boolean;
    duration: number;
    thumbnail: string;
    type: 'youtube';
} | {
    url: string;
    title: string;
    requestedBy: GuildMember;
    requestChannelId: string;
    repeat: boolean;
    type: 'attachment';
}



const ytdlp = new YTDLP();
export class IOEClientPlayer {
    private queue = new PlayerQueue();
    private guildPlayers: Map<string, AudioPlayer> = new Map();
    private lock: Map<string, boolean> = new Map();
    constructor(private client: IOEClient) { }
    /**
     * Creates an AudioPlayer instance for a given guild ID.
     * If the AudioPlayer instance already exists, it is returned.
     * The AudioPlayer instance is set to destroy the VoiceConnection when it is idle and there are no more items in the queue.
     * @param {string} guildId - The guild ID to create the AudioPlayer instance for.
     * @returns {Promise<AudioPlayer>} - A promise that resolves with the created AudioPlayer instance.
     */
    async createPlayer(guildId: string) {
        if (this.guildPlayers.has(guildId)) return this.guildPlayers.get(guildId)!;
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
        this.guildPlayers.set(guildId, player);


        player.on('stateChange', async (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                const connection = getVoiceConnection(guildId);

                if (!connection) return;
                if (this.queue.isEmpty(guildId)) {
                    connection.destroy();
                    return;
                }
                const nextItem = this.queue.getNext(guildId);

                if (!nextItem) {
                    connection.destroy();
                    return;
                }
                const guild = await this.client.guilds.fetch(guildId);
                const channel = guild.channels.cache.get(nextItem.requestChannelId) as GuildTextBasedChannel;
                const nextResource = this.createAudioResource(nextItem);
                if (!nextResource) {
                    await this.client.sendMention(channel, `Could not create audio resource for **${nextItem.title}**. Skipping.`, nextItem.requestedBy);
                    return;
                }

                player.play(nextResource);
                player.unpause();
                await channel.send(`Now playing: **${nextItem.title}**`);
            }

        });

        return player;
    }
    /**
     * Plays a song in a voice channel.
     * @param {GuildMember} member - The guild member to play the song for.
     * @param {GuildTextBasedChannel} channel - The text channel to send messages to.
     * @param {string | Attachment} data - The song data to play. Can be a URL, video title, or an attachment.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async play(member: GuildMember, channel: GuildTextBasedChannel, data: string | Attachment) {

        try {
            this.client.logger.info(`Play method called in guild ${member.guild?.name}`);
            const guildId = member.guild.id;
            const channelId = member.voice.channelId;
            if (!channelId) {
                await this.client.sendMention(channel, `You need to be in a voice channel to play music.`, member);
                return;
            };
            const queueItem = await this.extract(data, member, channel);
            if (!queueItem) {
                await this.client.sendMention(channel, `Something went wrong.`, member);
                return;
            }
            const player = await this.createPlayer(guildId);
            if (player.state.status !== AudioPlayerStatus.Idle) {
                this.queue.add(guildId, queueItem);
                await this.client.sendMention(channel, `Added to queue: **${queueItem.title}**`, member);
                return;
            }
            const connection = await this.getConnection(member);
            if (!connection) {
                await this.client.sendMention(channel, 'Could not connect to voice channel.', member);
                return;
            }
            const resource = this.createAudioResource(queueItem);
            if (!resource) {
                await this.client.sendMention(channel, 'Could not create audio resource.', member);
                return;
            }
            connection.subscribe(player);
            player.play(resource);
            player.unpause()
            await this.client.sendMention(channel, `Now playing: **${queueItem.title}**`, member);

        } catch (e) {
            this.client.logger.error(e, `Error in play method in guild ${member.guild?.name}`);
        }
    }
    /**
     * Creates an AudioResource from a given QueueItem.
     * If the QueueItem is a YouTube video, it will use ytdlp to stream the audio.
     * If the QueueItem is an attachment, it will use the attachment URL to create the resource.
     * If the QueueItem type is unsupported, it will throw an error.
     * @throws Error if the QueueItem type is unsupported
     * @returns {AudioResource | null} The created AudioResource, or null if an error occurred
     */
    private createAudioResource(queueItem: QueueItem) {
        try {
            if (queueItem.type === 'youtube') {
                const stream = ytdlp.stream(queueItem.url).filter('audioonly').audioQuality('10');

                const resource = createAudioResource(stream.getStream(), {
                    inputType: StreamType.Arbitrary,
                });
                return resource;
            } else if (queueItem.type === 'attachment') {
                const resource = createAudioResource(queueItem.url, {
                    inputType: StreamType.Arbitrary,
                    inlineVolume: true,
                });
                return resource;
            }
            throw new Error('Unsupported queue item type');
        } catch (e) {
            this.client.logger.error(e, `Error creating audio resource for ${queueItem.title}`);
            return null;
        }
    }
    /**
     * Fetches the voice connection for a given guild member.
     * If the member is not in a voice channel, it will return null.
     * If the member is in a voice channel, it will return the existing connection or create a new one.
     * @param {GuildMember} member - The guild member to fetch the connection for
     * @returns {Promise<VoiceConnection | null>} The fetched voice connection, or null if an error occurred
     */
    private async getConnection(member: GuildMember) {

        try {
            const guildId = member.guild.id;
            const channelId = member.voice.channelId;
            if (!channelId) return;
            const voiceAdapterCreator = member.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator;
            let connection = getVoiceConnection(guildId);
            if (!connection || connection.joinConfig.channelId !== channelId) {
                connection = joinVoiceChannel({
                    channelId,
                    guildId,
                    adapterCreator: voiceAdapterCreator,
                });
            }
            return connection;
        } catch (e) {
            this.client.logger.error(e, `Error connecting to voice channel in guild ${member.guild.id}`);
            return;
        }
    }
    /**
     * Extracts a song from a message and returns it as a QueueItem.
     * Supported message types are:
     * - YouTube video links
     * - Message attachments (audio files)
     * @param {Message} message - The message to extract the song from
     * @param {GuildMember} member - The guild member who sent the message
     * @returns {Promise<QueueItem | undefined>} The extracted song, or undefined if an error occurred
     */
    private async extract(data: string | Attachment, member: GuildMember, channel: GuildTextBasedChannel): Promise<QueueItem | undefined> {
        try {
            if (typeof data === 'string') {
                const urlMatch = data.match(regexYoutube);
                if (urlMatch) {
                    const info = await ytdlp.getInfoAsync(new URL(urlMatch[0]).searchParams.get('v') || "", {
                        cookies: "cookies.txt"
                    }) as VideoInfo;
                    
                    return {
                        url: urlMatch[0],
                        title: info.title,
                        duration: info.duration,
                        thumbnail: info.thumbnails.pop()?.url || "",
                        requestedBy: member,
                        requestChannelId: channel.id,
                        type: 'youtube' as const,
                        repeat: false
                    }
                }
                return;
            }

            const attachment = data;
            return {
                url: attachment.url,
                title: attachment.name || "Unknown",
                requestedBy: member,
                requestChannelId: channel.id,
                type: 'attachment' as const,
                repeat: false
            }


        } catch (e) {
            this.client.logger.error(e, `Error while extracting song in guild ${member.guild?.name}`);
            return;
        }
    }
}


class PlayerQueue {
    private queue: Map<string, QueueItem[]> = new Map();
    private current: QueueItem | null = null;
    constructor() { }

    /**
     * Adds an item to the queue for the given guild.
     * If the guild does not have a queue, it creates one.
     * @param {string} guildId - The ID of the guild to add the item to.
     * @param {queueItem} item - The item to add to the queue.
     */
    public add(guildId: string, item: QueueItem) {
        if (!this.queue.has(guildId)) {
            this.queue.set(guildId, []);
        }
        this.queue.get(guildId)?.push(item);
    }
    /**
     * Gets the current item in the queue for the given guild.
     * If the guild does not have a queue or the queue is empty, it returns null.
     * @param {string} guildId - The ID of the guild to get the current item from.
     * @returns {QueueItem | null} The current item in the queue, or null if the guild does not have a queue or the queue is empty.
     */
    public getCurrent(guildId: string) {
        return this.current;
    }
    /**
     * Gets the next item from the queue for the given guild.
     * If the guild does not have a queue or the queue is empty, it returns null.
     * If the next item in the queue is set to repeat, it returns the item without removing it from the queue.
     * Otherwise, it removes the next item from the queue and returns it.
     * If an error occurs, it sets the current item to null and returns null.
     * @param {string} guildId - The ID of the guild to get the next item from.
     * @returns {Promise<QueueItem | null>} The next item from the queue, or null if the guild does not have a queue or the queue is empty.
     */
    public getNext(guildId: string) {
        try {
            const queue = this.queue.get(guildId);
            if (!queue || queue.length === 0) {
                this.current = null;
                return null;
            }
            const nextItem = queue[0];
            if (nextItem.repeat) {
                return nextItem;
            }
            this.current = nextItem;
            this.queue.set(guildId, queue.slice(1));
            return nextItem;
        } catch (e) {
            this.current = null;
            return null;
        }
    }
    /**
     * Clears the queue for the given guild.
     * If the guild does not have a queue, this method does nothing.
     * @param {string} guildId - The ID of the guild to clear the queue for.
     */
    public clear(guildId: string) {
        this.queue.delete(guildId);
    }

    /**
     * Checks if the queue for the given guild is empty.
     * If the guild does not have a queue, this method returns true.
     * @param {string} guildId - The ID of the guild to check the queue for.
     * @returns {boolean} True if the queue is empty, false otherwise.
     */
    public isEmpty(guildId: string) {
        const queue = this.queue.get(guildId);
        return !queue || queue.length === 0;
    }

    /**
     * Shuffles the queue for the given guild.
     * If the guild does not have a queue, this method does nothing.
     * @param {string} guildId - The ID of the guild to shuffle the queue for.
     */
    public shuffle(guildId: string) {
        const queue = this.queue.get(guildId);
        if (!queue) return;
        this.queue.set(guildId, shuffle(queue));
    }
}