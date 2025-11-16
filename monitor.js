import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log("Bot logged in as", client.user.tag);
});

client.on("messageCreate", async (message) => {
    if (message.channel.id !== CHANNEL_ID) return;
    if (!message.content.includes(":narrow_a:")) return;

    const lines = message.content.split("\n");
    const pairs = [];

    for (const line of lines) {
        const parts = line.split(":nwl_s:");
        if (parts.length < 2) continue;

        const left = parseInt(parts[0].replace(/\D/g, ""));
        const right = parseInt(parts[1].replace(/\D/g, ""));

        if (!isNaN(left) && !isNaN(right)) {
            pairs.push([left, right]);
        }
    }

    // Apply your rule:
    const matches = pairs.filter(p => p[0] > 2 && p[1] < 2000);

    if (matches.length > 0) {
        console.log("MATCH FOUND:", matches);

        // Send Pushover
        await fetch("https://api.pushover.net/1/messages.json", {
            method: "POST",
            body: new URLSearchParams({
                token: PUSHOVER_TOKEN,
                user: PUSHOVER_USER,
                message: `Nairi Match Found:\n${JSON.stringify(matches)}`
            })
        });
    }
});

client.login(BOT_TOKEN);
