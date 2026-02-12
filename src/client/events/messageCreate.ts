import { defineEventHandler } from "../IOEClientEvents.js";
import { music } from '../music/index.js';

export default defineEventHandler<"messageCreate">((client, message) => {
    const musicInstance = music(client);
    //musicInstance.play(message)
})

