import { Client, GatewayIntentBits, Partials } from "discord.js";
import fetch from "node-fetch";

// -------------------------
// CONFIGURATION RULES
// -------------------------
const RULE_LEFT_MIN = 0;          // minimum left value
const RULE_RIGHT_MAX = 1500;      // maximum right value
const CHANNEL_ID = process.env.CHANNEL_ID;
const NOTIFY_ROLE = process.env.NOTIFY_ROLE;

// -------------------------
// DISCORD CLIENT
// -------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// -------------------------
// KEEP ALIVE PING (Render)
// -------------------------
const KEEPALIVE_URL = process.env.KEEPALIVE_URL;
setInterval(() => {
    if (KEEPALIVE_URL) fetch(KEEPALIVE_URL).catch(() => {});
}, 5 * 60 * 1000); // 5 minutes

// -------------------------
// PARSER FUNCTION
// -------------------------
function parseNaiMessage(text) {
    const lines = text.split("\n").filter(l => l.includes("¦"));

    if (lines.length === 0) return null;

    let results = [];

    for (let line of lines) {
        const cleanLine = line.replace(/\s+/g, " ").trim();

        // Extract numbers + character name
        // Format looks like:
        // :narrow_a::none_1:¦    3 :nwl_s: ¦ :nt1_s: ¦ 2455 ¦ Farah Karim · Call of Duty
        
        const regex = /¦\s*(\d+)\s*:nwl_s:\s*¦\s*:\w+:\s*¦\s*(\d+)\s*¦\s*(.+)$/;

        let match = cleanLine.match(regex);
        if (!match) continue;

        let left = parseInt(match[1]);
        let right = parseInt(match[2]);
        let character = match[3].trim();

        results.push({ left, right, character });
    }

    return results.length > 0 ? results : null;
}

// -------------------------
// EVENT LISTENER
// -------------------------
client.on("messageCreate", async (msg) => {
    if (msg.author.id !== process.env.APP_BOT_ID) return;
    if (!msg.content.includes("¦")) return;

    const parsed = parseNaiMessage(msg.content);
    if (!parsed) return;

    const channel = await client.channels.fetch(CHANNEL_ID);

    for (let entry of parsed) {
        if (entry.left >= RULE_LEFT_MIN && entry.right <= RULE_RIGHT_MAX) {
            channel.send(
                `${NOTIFY_ROLE} ⚠️ **Hit Found!**\n` +
                `**Character:** ${entry.character}\n` +
                `Left: **${entry.left}** | Right: **${entry.right}**`
            );
        }
    }
});

// -------------------------
// BOT READY
// -------------------------
client.on("clientReady", () => {
    console.log(`Bot is online as ${client.user.tag}`);
});

// -------------------------
// LOGIN
// -------------------------
client.login(process.env.BOT_TOKEN);

