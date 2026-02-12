import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import path from "path";
import fs from 'fs';
import { pathToFileURL } from "url";
import { REST, Routes } from 'discord.js';
import type { IOEClient } from "./IOEClient.js";



export class IOECLientCommands {
    private loaded = false
    private commands: Map<string, Command> = new Map();
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
        const commandsDir = path.resolve(import.meta.dirname, 'commands');
        const files = fs.readdirSync(commandsDir)
        for (const file of files) {
            const comandName = file.split('.')[0]

            const mod: {default: Command } | { default: unknown} = await import(pathToFileURL(path.join(commandsDir, file)).href);

           
            if (!(mod.default instanceof Command)) {
                throw new Error(
                    `Event file "${file}" must default export a class named Command. This can be done by using defineCommand, 
                    Example: import { defineCommand } from "client/IOEClientCommands.js";
                                import { SlashCommandBuilder } from "discord.js";
                                export default defineCommand(new SlashCommandBuilder().setName('ping').setDescription('Reply with pong'), async (client, interaction) => interaction.reply('Pong!'));`);
            }
            this.commands.set(mod.default.data.name, mod.default);
        }
        this.loaded = true
    }
    /**
     * Deploys all commands to the Discord API.
     * If the commands haven't been loaded yet, it will load them first.
     * If the client token hasn't been found, it will throw an error.
     * @throws {Error} If the client token hasn't been found.
     */
    async deploy() {
        if(!this.loaded) await this.load()
        const token = this.client.token
        if(!token) throw new Error('Token not found')
        const rest = new REST().setToken(token);
        const data = await rest.put(
            Routes.applicationCommands(this.client.clientId), {body: this.getCommandsJSON()}
        )
        this.client.logger.info('Commands deployed');
         
    }
/**
 * Deletes all global commands that were deployed to the Discord API.
 * If the commands haven't been loaded yet, it will load them first.
 * If the client token hasn't been found, it will throw an error.
 * Doesn't delete guild specific commands
 * @throws {Error} If the client token hasn't been found.
 */
    async deleteAll() {
        if(!this.loaded) await this.load()
        const token = this.client.token
        if(!token) throw new Error('Token not found')
        const rest = new REST().setToken(token);
           const data = await rest.put(
            Routes.applicationCommands(this.client.clientId), {body: []}
        )
        this.client.logger.info('Commands deleted');
    }
    private getCommandsJSON() {
        const commands = [];
        for (const command of this.commands.values()) {
            commands.push(command.data.toJSON());
        }
        return commands;
    }

/**
 * Invokes the handler of a command given an interaction.
 * If the command doesn't exist, it does nothing.
 * @param {ChatInputCommandInteraction} interaction - The interaction to invoke the command with.
 */
    invokeCommand(interaction: ChatInputCommandInteraction) {
        const command = this.commands.get(interaction.commandName);
        if (command) {
            command.handler(this.client, interaction);
        }
    }
}



type CommandHandler =
    (client: IOEClient, interaction: ChatInputCommandInteraction) => void;
class Command {
    constructor(public data: SlashCommandBuilder, public handler: CommandHandler) { }
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
    handler: CommandHandler
) => new Command(command, handler);
