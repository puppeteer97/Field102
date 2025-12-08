//---------------------------------------------------------
// DEPENDENCIES
//---------------------------------------------------------
import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

//---------------------------------------------------------
// HARD SETTINGS
//---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";

// NEW ALERT RULES
const ALERT_A_LEFT_MIN = 20;
const ALERT_A_RIGHT_MAX = 400;

const ALERT_B_LEFT_MIN = 30;
const ALERT_B_RIGHT_MAX = 600;

const ALERT_C_RIGHT_MAX = 100; // irrespective of left (your override modifies this logic)

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
// PARSER (UPDATED TO HANDLE EMOJIS + MULTIPLE FIELDS)
//---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  // Extract ALL numbers inside backticks, regardless of spacing or emojis
  const matches = [...line.matchAll(/` *(\d{1,5}) *`/g)];

  if (matches.length < 2) return null;

  // LEFT = first number
  // RIGHT = last number (before name field)
  const left = parseInt(matches[0][1], 10);
  const right = parseInt(matches[matches.length - 1][1], 10);

  return { left, right };
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

    //-----------------------------------------------------
    // ALERTS (NEW RULES)
    //-----------------------------------------------------

    const hitsA = rows.filter(
      r => r.left >= ALERT_A_LEFT_MIN && r.right < ALERT_A_RIGHT_MAX
    );

    const hitsB = rows.filter(
      r => r.left >= ALERT_B_LEFT_MIN && r.right < ALERT_B_RIGHT_MAX
    );

    // MODIFIED ALERT C — left > 3 AND right < 100
    const hitsC = rows.filter(
      r => r.left > 3 && r.right < ALERT_C_RIGHT_MAX
    );

    // NEW ALERT D — right 1–19
    const hitsD = rows.filter(
      r => r.right >= 1 && r.right <= 19
    );

    // Debug logging
    if (hitsA.length)
      console.log("ALERT A:", hitsA.map(h => `(${h.left} / ${h.right})`));

    if (hitsB.length)
      console.log("ALERT B:", hitsB.map(h => `(${h.left} / ${h.right})`));

    if (hitsC.length)
      console.log("ALERT C:", hitsC.map(h => `(${h.left} / ${h.right})`));

    if (hitsD.length)
      console.log("ALERT D (right 1-19):", hitsD.map(h => `(${h.left} / ${h.right})`));

    if (!hitsA.length && !hitsB.length && !hitsC.length && !hitsD.length) return;

    const packA = hitsA.map(h => `(${h.left} / ${h.right})`);
    const packB = hitsB.map(h => `(${h.left} / ${h.right})`);
    const packC = hitsC.map(h => `(${h.left} / ${h.right})`);
    const packD = hitsD.map(h => `(${h.left} / ${h.right})`);

    //-----------------------------------------------------
    // PUSHOVER NOTIFICATIONS
    //-----------------------------------------------------
    if (hitsA.length)
      await sendPushover("Alert A — left>=20 & right<400:\n" + packA.join("\n"));

    if (hitsB.length)
      await sendPushover("Alert B — left>=30 & right<600:\n" + packB.join("\n"));

    if (hitsC.length)
      await sendPushover("Alert C — left>3 & right<100:\n" + packC.join("\n"));

    if (hitsD.length)
      await sendPushover("Alert D — right between 1 and 19:\n" + packD.join("\n"));

    //-----------------------------------------------------
    // DISCORD NOTIFICATIONS
    //-----------------------------------------------------
    if (ALERT_CHANNEL_ID) {
      const ch = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => {});

      if (ch?.send) {
        if (hitsA.length)
          ch.send(`${NOTIFY_PREFIX} **Alert A — left>=10 & right<300**\n${packA.join("\n")}`);

        if (hitsB.length)
          ch.send(`${NOTIFY_PREFIX} **Alert B — left>=20 & right<600**\n${packB.join("\n")}`);

        if (hitsC.length)
          ch.send(`${NOTIFY_PREFIX} **Alert C — left>3 & right<100**\n${packC.join("\n")}`);

        if (hitsD.length)
          ch.send(`${NOTIFY_PREFIX} **Alert D — right between 1 and 19**\n${packD.join("\n")}`);
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
