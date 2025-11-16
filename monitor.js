import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// No dotenv needed on Render

dotenv.config();

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
    console.log("Monitor is online as:", client.user.tag);
});

client.on("messageCreate", async (message) => {
    if (message.channel.id !== CHANNEL_ID) return;
    if (!message.content.includes(":narrow_a:")) return;

    const lines = message.content.split("\n");
    const results = [];

    for (const line of lines) {
        // UNIVERSAL REGEX for Nairi drops
        const match = line.match(
            /:narrow_a:.*?¦\s*([0-9]+)\s*:nwl_s:.*?¦\s*([0-9]+)\s*¦\s*(.+)/
        );

        if (match) {
            const left = parseInt(match[1]);
            const right = parseInt(match[2]);
            const name = match[3].trim();

            if (!isNaN(left) && !isNaN(right)) {
                results.push({ left, right, name });
            }
        }
    }

    // ---- YOUR FILTER RULE ----
    const matches = results.filter(entry => entry.left >= 5 && entry.right < 1500);

    if (matches.length > 0) {
        console.log("MATCH FOUND:", matches);

        const body = matches
            .map(m => `(${m.left} / ${m.right}) — ${m.name}`)
            .join("\n");

        // Send Pushover Notification
        try {
            await fetch("https://api.pushover.net/1/messages.json", {
                method: "POST",
                body: new URLSearchParams({
                    token: PUSHOVER_TOKEN,
                    user: PUSHOVER_USER,
                    message: `Nairi Match Found:\n${body}`
                })
            });

            console.log("Pushover Sent.");
        } catch (err) {
            console.error("❌ Pushover Error:", err);
        }
    }
});

client.login(BOT_TOKEN);

