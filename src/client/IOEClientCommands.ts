import type { ChatInputCommandInteraction, Interaction, RESTPostAPIChatInputApplicationCommandsJSONBody, SlashCommandBuilder } from "discord.js";
import type { IOEClient } from "./IOEClient.js";
import path from "path";
import fs from 'fs';
import { pathToFileURL } from "url";
import { REST, Routes } from 'discord.js';
import { logger, Mutex } from '../utils/index.js'


export type CommandHandler =
    (client: IOEClient, interaction: ChatInputCommandInteraction) => Promise<void> | void;

export class Command {
    constructor(public data: SlashCommandBuilder, public handler: CommandHandler, public options: CommandOptions = {}) { }
}
export type CommandOptions = {
    guildOnly?: boolean;
    disabled?: boolean;
}

export class IOEClientCommands {
    private loaded = false
    private commands: Map<string, Command> = new Map();
    private readonly loaderMutex = new Mutex();
    constructor(private client: IOEClient) { }

    /**
     * Loads all the commands from the commands directory.
     * 
     * The commands directory should contain files with the following format:
     * - filename.ts: A TypeScript file that exports a Command.
     * 
     * The filename recommended to be the same as the name of the command.
     * The file should export a class named Command, which should be created using defineCommand.
     * 
     * @throws {Error} If a file in the commands directory does not default export a class named Command.
     */
    async load() {
        const unlock = await this.loaderMutex.lock();
        try {
            if (this.loaded) return
            const commandsDir = path.resolve(import.meta.dirname, 'commands');
            const files = fs.readdirSync(commandsDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
            for (const file of files) {
                const mod: { default: Command } | { default: unknown } = await import(pathToFileURL(path.join(commandsDir, file)).href);

                if (!(mod.default instanceof Command)) {
                    throw new Error(
                        `Command file "${file}" must default export a class named Command. This can be done by using defineCommand, 
                         Example: import { defineCommand } from "client/IOEClientCommands.js";
                                import { SlashCommandBuilder } from "discord.js";
                                export default defineCommand(new SlashCommandBuilder().setName('ping').setDescription('Reply with pong'), async (client, interaction) => interaction.reply('Pong!'));`);
                }
                this.commands.set(mod.default.data.name, mod.default);
            }
            this.loaded = true
        } catch (e) {
            logger.error(e, 'Error loading commands');
            this.commands.clear()
            // Re-throw the error
            throw e;
        } finally {
            unlock();
        }
    }
    /**
     * Deploys all commands to the Discord API.
     * If the commands haven't been loaded yet, it will load them first.
     * If the client token hasn't been found, it will throw an error.
     */
    async deploy() {
        try {
            if (!this.loaded) await this.load()
            const token = this.client.token
            if (!token) throw new Error('Token not found')
            const rest = new REST().setToken(token);
            const commands = this.getCommandsJSON();
            await rest.put(
                Routes.applicationCommands(this.client.clientId), { body: commands.global }
            )
            const guilds = await this.client.guilds.fetch();
            for (const guild of guilds.values()) {
                await rest.put(
                    Routes.applicationGuildCommands(this.client.clientId, guild.id), { body: commands.guildOnly }
                )
            }
            logger.info('Commands deployed');
        } catch (e) {
            logger.error(e, 'Error deploying commands');
        }
    }

    /**
     * Deletes all global commands that were deployed to the Discord API.
     * If the commands haven't been loaded yet, it will load them first.
     * If the client token hasn't been found, it will throw an error.
     * Doesn't delete guild specific commands
     */
    async deleteAll() {
        try {
            if (!this.loaded) await this.load()
            const token = this.client.token
            if (!token) throw new Error('Token not found')
            const rest = new REST().setToken(token);
            await rest.put(
                Routes.applicationCommands(this.client.clientId), { body: [] }
            )
            logger.info('Commands deleted');
        } catch (e) {
            logger.error(e, 'Error deleting commands');
        }
    }
    private getCommandsJSON() {
        const commands = {
            guildOnly: [] as RESTPostAPIChatInputApplicationCommandsJSONBody[],
            global: [] as RESTPostAPIChatInputApplicationCommandsJSONBody[]
        };
        for (const command of this.commands.values()) {
            if (command.options.disabled) continue;
            if (command.options.guildOnly) {
                commands.guildOnly.push(command.data.toJSON());
                continue;
            }
            commands.global.push(command.data.toJSON());
        }
        return commands;
    }

    /**
     * Invokes the handler of a command given an interaction.
     * If the command doesn't exist, it does nothing.
     * @param {ChatInputCommandInteraction} interaction - The interaction to invoke the command with.
     */
    async invokeCommand(interaction: Interaction) {
        if (!interaction.isChatInputCommand()) return;
        const command = this.commands.get(interaction.commandName);
        try {
            if (command) {
                await command.handler(this.client, interaction);
            }
        } catch (e) {
            logger.error(e, `Error invoking command ${interaction.commandName} in guild ${interaction.guildId}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(() => { });
            }
        }
    }
}




/**
 * Defines a command for the IOEClient.
 * @param {SlashCommandBuilder} command - The SlashCommandBuilder instance that defines the command.
 * @param {CommandHandler} handler - The function that will be called when the command is triggered.
 * @returns {Command} - A new Command instance.
 * @description
 * This function constructs a new Command instance with the given SlashCommandBuilder and CommandHandler.
 * It is used to define commands for the IOEClient.
 */

export const defineCommand = (
    command: SlashCommandBuilder,
    handler: CommandHandler,
    options: CommandOptions = {}
) => new Command(command, handler, options);
