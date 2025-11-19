import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// ---------------------------------------------------------
// HARD-CODED RULES
// ---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";   // Nairi app bot

// System A rules:
// LEFT >= 7  AND  RIGHT < 1000
const RULE_LEFT_MIN = 7;
const RULE_RIGHT_MAX = 1000;

// System B new rule:
// RIGHT < 100  (independent)
const RULE_RIGHT_CRITICAL = 100;

// Optional alert channel
const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

// Optional Pushover
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

// Optional mention prefix
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
    if (!msg.author || String(msg.author.id) !== APP_BOT_ID) return;
    if (!msg.content.includes("¦")) return;

    const rows = parseNairiMessage(msg.content);
    if (!rows.length) return;

    // -------------------------------
    // SYSTEM A: (existing rule)
    // LEFT >= 3 AND RIGHT < 1200
    // -------------------------------
    const ruleA_hits = rows.filter(
      r => r.left >= RULE_LEFT_MIN && r.right < RULE_RIGHT_MAX
    );

    // -------------------------------
    // SYSTEM B: (new rule)
    // RIGHT < 100, ANY LEFT
    // -------------------------------
    const ruleB_hits = rows.filter(
      r => r.right < RULE_RIGHT_CRITICAL
    );

    // If no triggers, stop
    if (!ruleA_hits.length && !ruleB_hits.length) return;

    // Handle Rule A
    if (ruleA_hits.length) {
      const lines = ruleA_hits.map(h => `(${h.left} / ${h.right})`);
      const body = `Nairi Match Found (Standard Rule):\n${lines.join("\n")}`;

      console.log("ALERT A:", lines);
      await sendPushover(body);

      if (ALERT_CHANNEL_ID) {
        try {
          const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
          if (channel?.send) {
            await channel.send(
              `${NOTIFY_PREFIX} **Nairi Match Found (Standard Rule)**\n${lines.join("\n")}`
            );
          }
        } catch (err) {
          console.warn("Failed sending Rule A:", err.message);
        }
      }
    }

    // Handle Rule B
    if (ruleB_hits.length) {
      const lines2 = ruleB_hits.map(h => `(${h.left} / ${h.right})`);
      const body2 = `⚠️ CRITICAL ALERT — Right < ${RULE_RIGHT_CRITICAL}:\n${lines2.join("\n")}`;

      console.log("ALERT B:", lines2);
      await sendPushover(body2);

      if (ALERT_CHANNEL_ID) {
        try {
          const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
          if (channel?.send) {
            await channel.send(
              `${NOTIFY_PREFIX} **⚠️ CRITICAL MATCH — Right < ${RULE_RIGHT_CRITICAL}**\n${lines2.join("\n")}`
            );
          }
        } catch (err) {
          console.warn("Failed sending Rule B:", err.message);
        }
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

