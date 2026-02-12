import { defineCommand } from "../IOEClientCommands.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";

export default defineCommand(new SlashCommandBuilder().setName('ping').setDescription('Reply with pong'), async (client, interaction) => interaction.reply({content: 'Pong!', flags: MessageFlags.Ephemeral}));