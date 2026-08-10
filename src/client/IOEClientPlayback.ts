import { ChatInputCommandInteraction, Interaction, type Attachment, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, StreamType } from "@discordjs/voice";
import { IOEClient } from "./IOEClient.js";
import { Mutex, YTDLP, logger } from "../utils/index.js";
import { DownloadManagerSingleton } from "../misc/DownloadManager.js";
import { PlayerQueue, QueueItem } from "./playback/PlayerQueue.js";
import { buttons, generateEmbed } from './playback/Misc.js'
import { spawn } from "child_process";
import { getFfmpegBinarysPath } from "../utils/ffmpegBinaries.js";


export class IOEClientPlayback {
    private ytdlp = new YTDLP()
    private queue = new PlayerQueue();
    private guildPlayers: Map<string, AudioPlayer> = new Map();
    private lock: Mutex = new Mutex();
    private downloadManager = DownloadManagerSingleton()
    constructor(private client: IOEClient) { }
    /**
     * Creates an AudioPlayer instance for a given guild ID.
     * If the AudioPlayer instance already exists, it is returned.
     * The AudioPlayer instance is set to destroy the VoiceConnection when it is idle and there are no more items in the queue.
     * @param {string} guildId - The guild ID to create the AudioPlayer instance for.
     * @returns {Promise<AudioPlayer>} - A promise that resolves with the created AudioPlayer instance.
     */
    private async createPlayer(guildId: string) {
        const ulnock = await this.lock.lock();
        try {
            if (this.guildPlayers.has(guildId)) return this.guildPlayers.get(guildId)!;
            const player = createAudioPlayer();
            this.guildPlayers.set(guildId, player);
            player.on('stateChange', async (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                    const connection = getVoiceConnection(guildId);
                    const queue = this.queue.get(guildId);
                    
                    if (!connection) return;
                    const nextItem = queue.getNext();

                    if (!nextItem) {
                        connection.destroy();
                        return;
                    }
                    const guild = await this.client.guilds.fetch(guildId);
                    const channel = guild.channels.cache.get(nextItem.requestChannelId) as GuildTextBasedChannel;
                    const nextResource = await this.createAudioResource(nextItem);
                    if (!nextResource) {
                        await channel.send(`Could not create audio resource for **${nextItem.title}**. Skipping.`);
                        return;
                    }

                    player.play(nextResource);
                    player.unpause();
                    const embed = await generateEmbed(queue);
                    await channel.send({ embeds: [embed], components: [buttons] });

                }

            });

            return player;
        } catch (e) {
            logger.error(e, 'Error creating player');
            return null;
        }

        finally { ulnock(); }

    }
    private async getPlayer(guildId: string) {
        if (this.guildPlayers.has(guildId)) return this.guildPlayers.get(guildId)!;
        return await this.createPlayer(guildId);
    }
    /**
     * Handles an interaction received from a button press.
     * If the interaction is a button press, it will handle the button press according to its custom ID.
     * The custom IDs and their corresponding handlers are as follows:
     * - 'togglePause': Toggles the pause state of the AudioPlayer.
     * - 'stop': Stops the AudioPlayer and clears the queue.
     * - 'next': Skips to the next item in the queue.
     * - 'toggleRepeat': Toggles the repeat state of the current item in the queue.
     * - 'shuffle': Shuffles the queue.
     * @param {Interaction} interaction - The interaction to handle.
     */
    async handleInteraction(interaction: Interaction) {
        logger.debug(`Interaction received: ${interaction.id}`);
        if (!interaction.isButton()) return;
        const guildId = interaction.guildId!;
        const player = await this.getPlayer(guildId);
        if (!player) return;
        const queue = this.queue.get(guildId);
        switch (interaction.customId) {


            case 'togglePause': {
                if (player.state.status === AudioPlayerStatus.Playing) {
                    player.pause();
                    const embed = await generateEmbed(queue, true);
                    await interaction.reply({ embeds: [embed], components: [buttons] });

                } else {
                    player.unpause();
                    const embed = await generateEmbed(queue);
                    await interaction.reply({ embeds: [embed], components: [buttons] });
                }
                break;
            }
            case 'stop': {
                queue.clear();
                player.stop();
                await interaction.reply({ content: 'Stopped' });
                break;
            }
            case 'next': {
                if (queue.current?.repeat) queue.toggleRepeat();
                // Logic is handled by player stateChange event callback
                player.stop();
                await interaction.update({});
                break;
            }
            case 'toggleRepeat': {
                queue.toggleRepeat();
                const embed = await generateEmbed(queue);
                await interaction.reply({ embeds: [embed], components: [buttons] });
                break;
            }
            case 'shuffle': {
                queue.shuffle();
                const embed = await generateEmbed(queue);
                await interaction.reply({ embeds: [embed], components: [buttons] });
                break;
            }
            default: {
                break;
            }
        }

    }

    /**
     * Plays a song in a voice channel.
     * @param {GuildMember} member - The guild member to play the song for.
     * @param {GuildTextBasedChannel} channel - The text channel to send messages to.
     * @param {string | Attachment} data - The song data to play. Can be a URL, video title, or an attachment.
     * @returns {Promise<void>} - A promise that resolves when the operation is complete.
     */
    async play(data: string | Attachment, { channel, member }: { channel: GuildTextBasedChannel; member: GuildMember }) {

        try {
            logger.info(`Play command called in guild ${member.guild.name} with data ${data}`);
            if(!member.voice || !member.voice.channel) {
                await channel.send('You need to be in a voice channel to play music.');
                return;
            }
            const queueItem = await this.processRequest(data, { channel, member });

            if (!queueItem) {
                await channel.send('Something went wrong.');
                logger.error(`Queue item not found for guild ${member.guild.id} and data ${data}`);
                return;
            }
            const queue = this.queue.get(member.guild.id);
            queue.add(queueItem);
            const player = await this.getPlayer(member.guild.id);
            if (!player) {
                await channel.send('Something went wrong.');
                logger.error(`Player not found for guild ${member.guild.id} and data ${data}`);
                return;
            }
            if (player.state.status !== AudioPlayerStatus.Idle) {
                const embed = await generateEmbed(queue);

                await channel.send({ components: [buttons], embeds: [embed] });
                return;
            }
            const connection = await this.getConnection(member);
            if (!connection) {
                await channel.send('Could not connect to voice channel.');
                logger.error(`Connection not found for guild ${member.guild.id} and data ${data}`);
                return;
            }
            const resource = await this.createAudioResource(queueItem);
            if (!resource) {
                await channel.send('Something went wrong.');
                logger.error(`Could not create audio resource for guild ${member.guild.id} and queue item ${queueItem}`);
                return;
            }
            connection.subscribe(player);
            player.play(resource);
            player.unpause()
            const embed = await generateEmbed(queue);
            await channel.send({ components: [buttons], embeds: [embed] });

        } catch (e) {
            logger.error(e, `Error in play method in guild ${member.guild.name}`);
        }
    }
    async goto(time: string, { channel, member }: { channel: GuildTextBasedChannel; member: GuildMember }) {
        try {
            logger.debug(`Goto command called in guild ${member.guild.name} with time ${time}`);
            const guildId = member.guild.id;
            if (!guildId) {
                logger.error(`Guild ID not found for member ${member.id}`);
                await channel.send('Something went wrong. Please try again later.');
                return;
            }
            const queue = this.queue.get(guildId);
            if (!queue.current) {
                await channel.send('No song is currently playing.');
                return;
            }
            const timeParts = time.split(':').map(Number);
            let seconds = 0;
            if (timeParts.length === 3) {
                seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
            } else if (timeParts.length === 2) {
                seconds = timeParts[0] * 60 + timeParts[1];
            } else if (timeParts.length === 1) {
                seconds = timeParts[0];
            }
            if (seconds < 0) {
                await channel.send('Invalid time.');
                return;
            }
            const player = await this.getPlayer(guildId);
            if (!player) {
                await channel.send('Something went wrong.');

                logger.error(`Player not found for guild ${guildId} and time ${time}`);
                return;
            }
            const queueItem = queue.current;
            let pathToSource: string | null = null;
            if (queueItem.type === 'url') {
                const cacheEntry = await this.downloadManager.getCacheEntry(queueItem.id, 'audio');
                if(!cacheEntry) {
                    await channel.send('Audio file not found in cache. Please play the song again.');
                    logger.error(`Audio file not found in cache for guild ${guildId} and queue item ${queueItem.id}`);
                    return;
                }
                pathToSource = cacheEntry.path;
            } else if (queueItem.type === 'attachment') {
                pathToSource = queueItem.url;
            }
            if (!pathToSource) {
                await channel.send('Something went wrong.');
                logger.error(`Unsupported queue item type in goto for guild ${guildId}: ${queueItem.type}`);
                return;
            }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
            const ffmpegProcess = spawn(getFfmpegBinarysPath(), [
                "-ss", seconds.toString(),
                "-i", pathToSource,
                "-f", "s16le",
                "-ar", "48000",
                "-ac", "2",
                "pipe:1"
            ]);

            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Raw,
            });
            player.play(resource);
            const embed = await generateEmbed(queue);
            await channel.send({ components: [buttons], embeds: [embed] });
        } catch (e) {
            logger.error(e, `Error in goto method in guild ${member.guild.name}`);
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
    private async createAudioResource(queueItem: QueueItem) {
        try {
            if (queueItem.type === 'url') {
                
                
                const downloadResult = await this.downloadManager.download(queueItem.videoData, 'audio');
                if (!downloadResult) {
                    logger.error(`Download failed for ${queueItem.videoData.webpage_url}`);
                    return null;
                }
                const resource = createAudioResource(downloadResult.path);
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
            logger.error(e, `Error creating audio resource for ${queueItem.title}`);
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
            logger.error(e, `Error connecting to voice channel in guild ${member.guild.id}`);
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
    private async processRequest(data: string | Attachment, { channel, member }: { channel: GuildTextBasedChannel; member: GuildMember }): Promise<QueueItem | undefined> {
        try {
            if (typeof data === 'string') {
                const videoInfo = await this.ytdlp.getInfoAsync(data);
                if(!videoInfo) {
                    logger.error(`Could not fetch video info for ${data}`);
                    await channel.send('Could not fetch video info. Please check the URL and try again.');
                    return;
                }
                if(videoInfo._type === 'playlist') {
                    logger.debug(`Playlist request received for ${data} in guild ${member.guild.name}`);
                    await channel.send('Playlists are not supported. Please provide a single video/audio URL.');
                    return;
                }
                return {
                    id: videoInfo.id,
                    url: videoInfo.webpage_url,
                    title: videoInfo.title,
                    duration: videoInfo.duration,
                    thumbnail: videoInfo.thumbnails[videoInfo.thumbnails.length - 1].url,
                    requestedBy: {
                        id: member.user.id,
                        username: member.user.username,
                    },
                    videoData: videoInfo,
                    requestGuildId: member.guild.id,
                    requestChannelId: channel.id,
                    type: 'url' as const,
                    repeat: false
                }
            }
            const attachment = data;
            return {
                url: attachment.url,
                title: attachment.name || "Unknown",
                requestedBy: {
                    id: member.user.id,
                    username: member.user.username,
                },
                requestChannelId: channel.id,
                requestGuildId: member.guild.id,
                type: 'attachment' as const,
                repeat: false
            }


        } catch (e) {
            logger.error(e, `Error while extracting song in guild ${member.guild.name}`);
            return;
        }
    }
}


