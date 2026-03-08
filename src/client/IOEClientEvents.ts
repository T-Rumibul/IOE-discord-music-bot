import { ClientEvents } from "discord.js";
import type { IOEClient } from "./IOEClient.js";
import fs from 'fs';
import path from "path";
import { pathToFileURL } from "url";
import { logger, Mutex } from '../utils/index.js'
const clientEventNames = [
    'applicationCommandPermissionsUpdate',
    'autoModerationActionExecution',
    'autoModerationRuleCreate',
    'autoModerationRuleDelete',
    'autoModerationRuleUpdate',
    'cacheSweep',
    'channelCreate',
    'channelDelete',
    'channelPinsUpdate',
    'channelUpdate',
    'clientReady',
    'debug',
    'warn',
    'emojiCreate',
    'emojiDelete',
    'emojiUpdate',
    'entitlementCreate',
    'entitlementDelete',
    'entitlementUpdate',
    'error',
    'guildAuditLogEntryCreate',
    'guildAvailable',
    'guildBanAdd',
    'guildBanRemove',
    'guildCreate',
    'guildDelete',
    'guildUnavailable',
    'guildIntegrationsUpdate',
    'guildMemberAdd',
    'guildMemberAvailable',
    'guildMemberRemove',
    'guildMembersChunk',
    'guildMemberUpdate',
    'guildUpdate',
    'guildSoundboardSoundCreate',
    'guildSoundboardSoundDelete',
    'guildSoundboardSoundUpdate',
    'guildSoundboardSoundsUpdate',
    'inviteCreate',
    'inviteDelete',
    'messageCreate',
    'messageDelete',
    'messagePollVoteAdd',
    'messagePollVoteRemove',
    'messageReactionRemoveAll',
    'messageReactionRemoveEmoji',
    'messageDeleteBulk',
    'messageReactionAdd',
    'messageReactionRemove',
    'messageUpdate',
    'presenceUpdate',
    'invalidated',
    'roleCreate',
    'roleDelete',
    'roleUpdate',
    'threadCreate',
    'threadDelete',
    'threadListSync',
    'threadMemberUpdate',
    'threadMembersUpdate',
    'threadUpdate',
    'typingStart',
    'userUpdate',
    'voiceChannelEffectSend',
    'voiceStateUpdate',
    'webhooksUpdate',
    'interactionCreate',
    'shardDisconnect',
    'shardError',
    'shardReady',
    'shardReconnecting',
    'shardResume',
    'stageInstanceCreate',
    'stageInstanceUpdate',
    'stageInstanceDelete',
    'stickerCreate',
    'stickerDelete',
    'stickerUpdate',
    'subscriptionCreate',
    'subscriptionDelete',
    'subscriptionUpdate',
    'guildScheduledEventCreate',
    'guildScheduledEventUpdate',
    'guildScheduledEventDelete',
    'guildScheduledEventUserAdd',
    'guildScheduledEventUserRemove',
    'soundboardSounds',
    'ready'
] as const satisfies readonly (keyof ClientEvents)[];

type ClientEventName = (typeof clientEventNames)[number];

type EventHandler<K extends keyof ClientEvents> =
    (client: IOEClient, ...args: ClientEvents[K]) => Promise<void> | void;

type EventOptions = {
    once?: boolean;
};
class Event<K extends keyof ClientEvents> {
    /**
     * Constructs an instance of the Event class.
     * @param {EventHandler<K>} handler - The event handler function.
     * @param {EventOptions} [options] - The event options. If not specified, defaults to { once: false }.
     * @example
     * const event = new Event<'messageCreate'>((client, message) => {
     *     console.log(message.content);
     * }, { once: true });
     */
    constructor(public handler: EventHandler<K>, public options: EventOptions = {
        once: false
    }) { }
}

/**
 * Checks if a given string is a valid ClientEvents event name.
 * @param {string} name - The string to check.
 * @returns {boolean} True if the string is a valid ClientEvents event name, false otherwise.
 * @example
 * isClientEventName('ready') // true
 * isClientEventName('foo') // false
 */
function isClientEventName(name: string): name is ClientEventName {
    return (clientEventNames as readonly string[]).includes(name);
}

export class IOEClientEvents {
    private callbacks = new Map<keyof ClientEvents, Event<keyof ClientEvents>>();
    private loaded = false;
    private readonly loadMutex = new Mutex();


    /**
     * Constructs an instance of the IOEClientEvents class.
     * @param {IOEClient} client - The IOEClient instance to attach the events to.
     */
    constructor(private client: IOEClient) {
    }

    /**
     * Initializes the event handlers by reading all the files in the events directory and
     * importing the default export of each file. The default export of each file must be an
     * instance of the Event class.
     * @throws {Error} If an event file does not correspond to a valid ClientEvents event name
     * or if an event file does not export a class named Event.
     * 
     * @example
     * import { defineEventHandler } from "../IOEClientEvents.js";
     *
     * export default defineEventHandler<"clientReady">((client) => {
     *     client.logger.info(`Logged in as ${client.user?.tag}!`);
     * }, { once: true });
     */
    private async load() {
        const unlock = await this.loadMutex.lock();
        try {
            if (this.loaded) return
            const eventsDir = path.resolve(import.meta.dirname, 'events');
            const files = fs.readdirSync(eventsDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
            for (const file of files) {
                const eventName = file.split('.')[0]

                if (!isClientEventName(eventName)) {
                    throw new Error(`Event file "${file}" does not correspond to a valid ClientEvents event name, see IOEClientEvents.ts clientEventNames variable for reference.`);
                }

                const mod = await import(pathToFileURL(path.join(eventsDir, file)).href);
                if (!(mod.default instanceof Event)) {
                    throw new Error(
                        `Event file "${file}" must default export a class named Event. This can be done by using defineEventHandler, 
                    Example: import { defineEventHandler } from "../IOEClientEvents.js";

                    export default defineEventHandler<"clientReady">((client) => {
                    client.logger.info(\`Logged in as \$\{client.user?.tag\}!\`);
  
                    }, { once: true });`);
                }
                this.callbacks.set(eventName, mod.default as Event<keyof ClientEvents>);


            }
            this.loaded = true
        } catch (e) {
            logger.error(e, 'Error loading events');
            this.callbacks.clear();
            throw e;
        } finally {
            unlock();
        }
    }
    /**
     * Registers all the event handlers from the events directory.
     * 
     * If the event handler's once property is set to true, the event handler will be registered
     * with the client's once method. Otherwise, it will be registered with the client's on method.
     */
    async registerEvents() {
        if (!this.loaded) await this.load();
        for (const [eventName, event] of this.callbacks) {
            const method = event.options.once ? 'once' : 'on';

            this.client[method](eventName, async (...args: ClientEvents[keyof ClientEvents]) => {
                try {
                    await event.handler(this.client, ...args);
                } catch (e) {
                    logger.error(e, `Error invoking event ${eventName}`);
                }
            })

        }
    }
}





/**
 * Defines an event handler for the IOEClient.
 * @template K - The type of the event being handled.
 * @param {EventHandler<K>} handler - The event handler function.
 * @param {EventOptions} [options] - The event options. If not specified, defaults to { once: false }.
 * @returns {Event<K>} - A new Event instance.
 * @example
 * const event = defineEventHandler<'messageCreate'>((client, message) => {
 *     console.log(message.content);
 * }, { once: true });
 */
export const defineEventHandler = <K extends keyof ClientEvents>(
    handler: EventHandler<K>,
    options?: EventOptions
) => new Event(handler, options);