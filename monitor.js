//---------------------------------------------------------
// DEPENDENCIES
//---------------------------------------------------------
import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

//---------------------------------------------------------
// HARD SETTINGS
//---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";

// Alert A
const RULE_LEFT_MIN = 7;
const RULE_RIGHT_MAX = 1000;

// Alert B
const RULE_RIGHT_CRITICAL = 100;

// Alert C (NEW)
const RULE_LEFT_CRITICAL = 50;

const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

const KEEPALIVE_URL =
  process.env.KEEPALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  null;

//---------------------------------------------------------
// DISCORD CLIENT (AUTO-RECONNECT SAFE)
//---------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  closeTimeout: 5000,
  sweepers: { messages: { interval: 300, lifetime: 900 } }
});

//---------------------------------------------------------
// KEEPALIVE
//---------------------------------------------------------
if (KEEPALIVE_URL) {
  setInterval(() => {
    fetch(KEEPALIVE_URL).catch(() => {});
    console.log("Keepalive ping:", KEEPALIVE_URL);
  }, 240000);
}

//---------------------------------------------------------
// PARSER
//---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  const matches = [...line.matchAll(/` *(\d{1,5}) *`/g)];
  if (matches.length < 2) return null;

  return {
    left: parseInt(matches[0][1], 10),
    right: parseInt(matches[1][1], 10)
  };
}

function parseNairiMessage(text) {
  return text
    .split(/\r?\n/)
    .map(parseRow)
    .filter(Boolean);
}

//---------------------------------------------------------
// PUSHOVER
//---------------------------------------------------------
async function sendPushover(msg) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;
  try {
    const r = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: new URLSearchParams({
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        message: msg
      })
    });
    console.log("[Pushover] Status:", r.status);
  } catch (err) {
    console.log("[Pushover ERROR]", err);
  }
}

//---------------------------------------------------------
// DISCORD SHARD EVENTS
//---------------------------------------------------------
client.on("ready", () => {
  console.log("Bot ready:", client.user?.tag);
});

client.on("shardDisconnect", (event, shardID) => {
  console.log("⚠️ SHARD DISCONNECTED:", shardID, event.code, event.reason);
});

client.on("shardReconnecting", (id) => {
  console.log("♻️ Reconnecting shard:", id);
});

client.on("shardResume", (id) => {
  console.log("🔗 Shard resumed:", id);
});

//---------------------------------------------------------
// MAIN MESSAGE HANDLER
//---------------------------------------------------------
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.author || msg.author.id !== APP_BOT_ID) return;
    if (!msg.content.includes("¦")) return;

    const rows = parseNairiMessage(msg.content);
    if (!rows.length) return;

    // Alerts
    const hitsA = rows.filter(
      r => r.left >= RULE_LEFT_MIN && r.right < RULE_RIGHT_MAX
    );

    const hitsB = rows.filter(
      r => r.right < RULE_RIGHT_CRITICAL
    );

    const hitsC = rows.filter(
      r => r.left > RULE_LEFT_CRITICAL
    );

    if (hitsA.length)
      console.log("ALERT A:", hitsA.map(h => `(${h.left} / ${h.right})`));

    if (hitsB.length)
      console.log("ALERT B:", hitsB.map(h => `(${h.left} / ${h.right})`));

    if (hitsC.length)
      console.log("ALERT C (LEFT > 50):", hitsC.map(h => `(${h.left} / ${h.right})`));

    if (!hitsA.length && !hitsB.length && !hitsC.length) return;

    const packA = hitsA.map(h => `(${h.left} / ${h.right})`);
    const packB = hitsB.map(h => `(${h.left} / ${h.right})`);
    const packC = hitsC.map(h => `(${h.left} / ${h.right})`);

    if (hitsA.length)
      await sendPushover("Alert A:\n" + packA.join("\n"));

    if (hitsB.length)
      await sendPushover("Alert B (RIGHT < 100):\n" + packB.join("\n"));

    if (hitsC.length)
      await sendPushover("Alert C (LEFT > 50):\n" + packC.join("\n"));

    if (ALERT_CHANNEL_ID) {
      const ch = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => {});

      if (ch?.send) {
        if (hitsA.length)
          ch.send(`${NOTIFY_PREFIX} **Alert A**\n${packA.join("\n")}`);

        if (hitsB.length)
          ch.send(`${NOTIFY_PREFIX} **Alert B — RIGHT < 100**\n${packB.join("\n")}`);

        if (hitsC.length)
          ch.send(`${NOTIFY_PREFIX} **Alert C — LEFT > 50**\n${packC.join("\n")}`);
      }
    }

  } catch (err) {
    console.log("Handler error:", err);
  }
});

//---------------------------------------------------------
// LOGIN
//---------------------------------------------------------
(async () => {
  try {
    await client.login(process.env.BOT_TOKEN);
  } catch (err) {
    console.error("LOGIN FAILED:", err);
  }
})();
