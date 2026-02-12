import { defineEventHandler } from "../IOEClientEvents.js";
import { music } from '../music/index.js';

export default defineEventHandler<"interactionCreate">((client, interaction) => {
    if(!interaction.isChatInputCommand()) return;
    client.commands.invokeCommand(interaction);
})

