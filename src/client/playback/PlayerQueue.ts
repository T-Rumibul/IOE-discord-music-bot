import { GuildMember } from "discord.js";
import { shuffle } from "../../utils/index.js";

export type QueueItem = {
    path: string;
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


export class GuildQueue {
    private _queue: QueueItem[] = [];
    private _current: QueueItem | null = null;
    constructor(private _guildId: string) { }

    get guildId() {
        return this._guildId;
    }
    get length() {
        return this._queue.length;
    }
    get current() {
        return this._current;
    }
    private set current(current: QueueItem | null) {
        this._current = current;
    }
    /**
     * Shallow copy of the queue.
     */
    get queue() {
        return this._queue.slice();
    }
    /**
     * Adds a new item to the queue.
     * If the queue is currently empty (i.e. there is no current item), the new item is set as the current item.
     * Otherwise, the new item is added to the end of the queue.
     * @param {QueueItem} item - The item to add to the queue.
     */
    public add(item: QueueItem) {
        if (!this.current) {
            this.current = item;
            return;
        }
        this._queue.push(item);
    }


    /**
     * Toggles the repeat state of the current item in the queue.
     * If the current item is null, this does nothing.
     * @returns {void}
     */
    public toggleRepeat() {
        if (this.current) {
            this.current.repeat = !this.current.repeat;
        }
    }

    /**
     * Retrieves the next item from the queue.
     * If the current item has the repeat flag set to true, it will be returned.
     * If the queue is empty, this will return null.
     * @returns {QueueItem | null} The next item in the queue, or null if the queue is empty.
     */
    public getNext() {
        try {
            if (this.current?.repeat) return this.current;

            if (this.isEmpty()) {
                this.current = null;
                return null;
            }

            const nextItem = this._queue[0];
            this.current = nextItem;
            this._queue = this._queue.slice(1);
            return nextItem;
        } catch (e) {
            this.current = null;
            return null;
        }
    }

    /**
     * Clears the queue of all items.
     * This will also reset the current item to null.
     * @returns {void}
     */
    public clear() {
        this.current = null;
        this._queue = [];
    }


    /**
     * Checks if the queue is empty.
     * @returns {boolean} True if the queue is empty, false otherwise.
     */
    public isEmpty() {
        return this._queue.length === 0;
    }

    /**
     * Shuffles the queue in-place.
     * This will re-order the items in the queue randomly.
     * @returns {void}
     */
    public shuffle() {
        if (this.isEmpty()) return;
        this._queue = shuffle(this._queue);
    }


}

export class PlayerQueue {
    private _guildQueues: Map<string, GuildQueue> = new Map();
    constructor() { }
    /**
     * Retrieves the GuildQueue for a given guild ID.
     * If the GuildQueue for the given guild ID does not exist, it will be created.
     * @param {string} guildId - The guild ID to retrieve the GuildQueue for.
     * @returns {GuildQueue} The GuildQueue for the given guild ID.
     */
    public get(guildId: string): GuildQueue {
        if (this._guildQueues.has(guildId)) {
            return this._guildQueues.get(guildId)!;
        }
        const guildQueue = new GuildQueue(guildId);
        this._guildQueues.set(guildId, guildQueue);
        return guildQueue;
    }
}