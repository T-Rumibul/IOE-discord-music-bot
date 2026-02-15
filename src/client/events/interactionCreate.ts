import { defineEventHandler } from "../IOEClientEvents.js";

export default defineEventHandler<"interactionCreate">((client, interaction) => {
    if(!interaction.isChatInputCommand()) return;
    client.commands.invokeCommand(interaction);
})

