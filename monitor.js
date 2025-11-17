import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// ---------------------------------------------------------
// HARD-CODED RULES
// ---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";   // Nairi app bot

// Alerts when:
// LEFT >= 3  AND  RIGHT < 1200
const RULE_LEFT_MIN = 3;
const RULE_RIGHT_MAX = 1200;

// Optional alert channel
const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

// Optional Pushover
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

// Optional mention prefix (e.g. <@&role>)
const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

// Keepalive URL (Render)
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
// KEEP-ALIVE PINGER
// ---------------------------------------------------------
if (KEEPALIVE_URL) {
  setInterval(() => {
    fetch(KEEPALIVE_URL).catch(() => {});
    console.log("Keepalive ping:", KEEPALIVE_URL);
  }, 4 * 60 * 1000);
}

// ---------------------------------------------------------
// PERFECT BACKTICK PARSER
// Always scans ONLY:  ` 123`
// ---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  // Extract numbers inside backticks:  ` 558`
  const numMatches = [...line.matchAll(/` *(\d{1,5}) *`/g)];
  if (numMatches.length < 2) return null;

  const left = parseInt(numMatches[0][1], 10);
  const right = parseInt(numMatches[1][1], 10);

  return { left, right };
}

// ---------------------------------------------------------
// PARSE ENTIRE MESSAGE
// ---------------------------------------------------------
function parseNairiMessage(text) {
  if (!text) return [];
  return text.split(/\r?\n/).map(parseRow).filter(Boolean);
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
    // must be from Nairi app
    if (!msg.author || String(msg.author.id) !== APP_BOT_ID) return;

    // must contain row separator
    if (!msg.content.includes("¦")) return;

    const rows = parseNairiMessage(msg.content);
    if (!rows.length) return;

    // Apply rules
    const hits = rows.filter(
      r => r.left >= RULE_LEFT_MIN && r.right < RULE_RIGHT_MAX
    );

    if (!hits.length) return;

    // Build lines like "(11 / 558)"
    const lines = hits.map(h => `(${h.left} / ${h.right})`);
    const body = `Nairi Match Found:\n${lines.join("\n")}`;

    console.log("ALERT TRIGGERED:", lines);

    // Send to pushover
    await sendPushover(body);

    // Send to Discord alert channel
    if (ALERT_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
        if (channel?.send) {
          await channel.send(
            `${NOTIFY_PREFIX} **Nairi Match Found**\n${lines.join("\n")}`
          );
        }
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
  console.error("Missing BOT_TOKEN environment variable.");
} else {
  client.login(process.env.BOT_TOKEN).catch(err => {
    console.error("Login failed:", err);
  });
}

