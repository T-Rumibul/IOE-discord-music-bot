import { defineEventHandler } from "../IOEClientEvents.js";

export default defineEventHandler<"interactionCreate">((client, interaction) => {
    client.commands.invokeCommand(interaction);
    client.player.handleInteraction(interaction);
})

