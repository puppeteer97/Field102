import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// ---------------------------------------------------------
// HARD-CODED RULES
// ---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";   // Nairi app bot

// Only alert on: LEFT >= 3 AND RIGHT < 1000
const RULE_LEFT_MIN = 2;
const RULE_RIGHT_MAX = 1000;

// Optional Discord alert channel
const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

// Optional Pushover
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

// Optional role mention prefix
const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

// Keepalive URL
const KEEPALIVE_URL =
  process.env.KEEPALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  null;

// ---------------------------------------------------------
// CLIENT
// ---------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------------------------------------------------
// KEEP-ALIVE
// ---------------------------------------------------------
if (KEEPALIVE_URL) {
  setInterval(() => {
    fetch(KEEPALIVE_URL).catch(() => {});
    console.log("Keepalive ping:", KEEPALIVE_URL);
  }, 4 * 60 * 1000);
}

// ---------------------------------------------------------
// PAIR PARSER — bullet-proof version
// ---------------------------------------------------------
function extractPair(line) {
  if (!line.includes("¦")) return null;

  const clean = line
    .replace(/\u200B/g, "")      // remove zero-width chars
    .replace(/\s+/g, " ")        // collapse spaces
    .trim();

  // Extract ALL numbers in the order they appear
  const nums = [...clean.matchAll(/(\d{1,5})/g)].map(m => parseInt(m[1], 10));

  if (nums.length < 2) return null;

  return {
    left: nums[0],                      // FIRST number
    right: nums[nums.length - 1]        // LAST number before name
  };
}

// ---------------------------------------------------------
// PARSE ENTIRE MESSAGE
// ---------------------------------------------------------
function parseNairiMessage(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(extractPair)
    .filter(Boolean);
}

// ---------------------------------------------------------
// PUSHOVER
// ---------------------------------------------------------
async function sendPushover(message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;

  try {
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: new URLSearchParams({
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        message
      })
    });

    console.log("[Pushover] Status:", res.status);
  } catch (err) {
    console.error("[Pushover] Error:", err);
  }
}

// ---------------------------------------------------------
// MESSAGE HANDLER
// ---------------------------------------------------------
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.author || String(msg.author.id) !== APP_BOT_ID) return;
    if (!msg.content.includes("¦")) return;

    const pairs = parseNairiMessage(msg.content);
    if (!pairs.length) return;

    const hits = pairs.filter(
      p => p.left >= RULE_LEFT_MIN && p.right < RULE_RIGHT_MAX
    );

    if (!hits.length) return;

    const textLines = hits.map(h => `(${h.left} / ${h.right})`);
    const body = `Nairi Match Found:\n${textLines.join("\n")}`;

    console.log("ALERT:", textLines);

    await sendPushover(body);

    if (ALERT_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
        if (channel?.send)
          await channel.send(`${NOTIFY_PREFIX} **Nairi Match Found**\n${textLines.join("\n")}`);
      } catch (err) {
        console.warn("Failed to send to alert channel:", err.message);
      }
    }

  } catch (err) {
    console.error("Handler error:", err);
  }
});

// ---------------------------------------------------------
// READY + LOGIN
// ---------------------------------------------------------
client.once("ready", () => {
  console.log("Bot ready:", client.user?.tag ?? "(unknown)");
});

if (!process.env.BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env var.");
} else {
  client.login(process.env.BOT_TOKEN).catch(err => {
    console.error("Login failed:", err);
  });
}
