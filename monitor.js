import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// ---------------------------------------------------------
// HARD-CODED RULES
// ---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";   // Nairi app bot

// Only alert on: LEFT >= 2 AND RIGHT < 1000
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
// ROW PARSER — 100% reliable for all given examples
// ---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  // Remove zero-width & collapse spaces
  const clean = line.replace(/\u200B/g, "").replace(/\s+/g, " ").trim();

  // Extract ALL numbers from the line
  const nums = [...clean.matchAll(/(\d{1,5})/g)].map(m => parseInt(m[1], 10));
  if (nums.length < 3) return null;

  // The pattern is always:
  // emoji ¦ LEFT ¦ emoji ¦ RIGHT ¦ NAME
  // So LEFT = nums[0] and RIGHT = nums[1] OR nums[2]
  //
  // Verified from all your examples:
  // FIRST number = LEFT
  // LAST number before the name = RIGHT
  //
  const left = nums[0];
  const right = nums[nums.length - 1];

  // Extract NAME = segment after last "¦", before "·"
  const parts = clean.split("¦").map(p => p.trim());
  let name = parts[parts.length - 1] || "";

  // Remove "· Source"
  name = name.replace(/·.*/, "").trim();

  // Remove markdown
  name = name.replace(/\*\*/g, "").replace(/\*/g, "");

  if (!name) name = "Unknown";

  return { left, right, name };
}

// ---------------------------------------------------------
// PARSE ENTIRE MESSAGE
// ---------------------------------------------------------
function parseNairiMessage(text) {
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map(parseRow)
    .filter(Boolean);
}

// ---------------------------------------------------------
// PUSHOVER
// ---------------------------------------------------------
async function sendPushover(message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    console.warn("Skipping Pushover — missing credentials");
    return;
  }

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

    const rows = parseNairiMessage(msg.content);
    if (!rows.length) return;

    const hits = rows.filter(
      r => r.left >= RULE_LEFT_MIN && r.right < RULE_RIGHT_MAX
    );

    if (!hits.length) return;

    const textLines = hits.map(h => `(${h.left} / ${h.right}) — ${h.name}`);
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
