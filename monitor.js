//---------------------------------------------------------
// DEPENDENCIES
//---------------------------------------------------------
import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

//---------------------------------------------------------
// HARD SETTINGS
//---------------------------------------------------------
const APP_BOT_ID = "1312830013573169252";

// ALERT RULES
const ALERT_A_LEFT_MIN = 20;
const ALERT_A_RIGHT_MAX = 200;

const ALERT_B_LEFT_MIN = 30;
const ALERT_B_RIGHT_MAX = 400;

const ALERT_C_RIGHT_MAX = 100;

const ALERT_E_LEFT_MIN = 10; // ✅ NEW: Xmas25 alert

const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

const KEEPALIVE_URL =
  process.env.KEEPALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  null;

//---------------------------------------------------------
// NTFY
//---------------------------------------------------------
const NTFY_TOPIC = "puppeteer-nairi";
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

//---------------------------------------------------------
// DISCORD CLIENT
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
// PARSER (EXTENDED — SAFE)
//---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  const ticks = [...line.matchAll(/` *([^`]+?) *`/g)];
  if (ticks.length < 2) return null;

  const leftRaw = ticks[0][1].trim();
  const rightRaw = ticks[ticks.length - 1][1].trim();

  const left = parseInt(leftRaw, 10);
  const right = parseInt(rightRaw, 10);

  return { left, right, leftRaw, rightRaw };
}

function parseNairiMessage(text) {
  return text
    .split(/\r?\n/)
    .map(parseRow)
    .filter(Boolean);
}

//---------------------------------------------------------
// NTFY SENDER (REPLACES PUSHOVER)
//---------------------------------------------------------
async function sendNtfy(msg) {
  try {
    await fetch(NTFY_URL, {
      method: "POST",
      headers: {
        "Title": "OCR ALERT",
        "Priority": "5"
      },
      body: msg
    });
  } catch (err) {
    console.log("[ntfy ERROR]", err);
  }
}

//---------------------------------------------------------
// READY
//---------------------------------------------------------
client.on("ready", () => {
  console.log("Bot ready:", client.user?.tag);
});

//---------------------------------------------------------
// MAIN HANDLER
//---------------------------------------------------------
client.on("messageCreate", async (msg) => {
  try {
    if (!msg.author || msg.author.id !== APP_BOT_ID) return;
    if (!msg.content.includes("¦")) return;

    const rows = parseNairiMessage(msg.content);
    if (!rows.length) return;

    //-----------------------------------------------------
    // EXISTING ALERTS (UNCHANGED)
    //-----------------------------------------------------
    const hitsA = rows.filter(
      r => r.left >= ALERT_A_LEFT_MIN && r.right < ALERT_A_RIGHT_MAX
    );

    const hitsB = rows.filter(
      r => r.left >= ALERT_B_LEFT_MIN && r.right < ALERT_B_RIGHT_MAX
    );

    const hitsC = rows.filter(
      r => r.left > 3 && r.right < ALERT_C_RIGHT_MAX
    );

    const hitsD = rows.filter(
      r => r.right >= 1 && r.right <= 19
    );

    //-----------------------------------------------------
    // ✅ NEW ALERT E — Xmas25
    //-----------------------------------------------------
    const hitsE = rows.filter(
      r => r.left >= ALERT_E_LEFT_MIN && r.rightRaw === "Xmas25"
    );

    if (
      !hitsA.length &&
      !hitsB.length &&
      !hitsC.length &&
      !hitsD.length &&
      !hitsE.length
    ) return;

    const pack = hits =>
      hits.map(h => `(${h.leftRaw} / ${h.rightRaw})`).join("\n");

    //-----------------------------------------------------
    // NTFY (TEXT FORMAT UNCHANGED)
    //-----------------------------------------------------
    if (hitsA.length) await sendNtfy("Alert A:\n" + pack(hitsA));
    if (hitsB.length) await sendNtfy("Alert B:\n" + pack(hitsB));
    if (hitsC.length) await sendNtfy("Alert C:\n" + pack(hitsC));
    if (hitsD.length) await sendNtfy("Alert D:\n" + pack(hitsD));
    if (hitsE.length)
      await sendNtfy("Alert E — Xmas25:\n" + pack(hitsE));

    //-----------------------------------------------------
    // DISCORD
    //-----------------------------------------------------
    if (ALERT_CHANNEL_ID) {
      const ch = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => {});
      if (!ch?.send) return;

      if (hitsA.length) ch.send(`**Alert A**\n${pack(hitsA)}`);
      if (hitsB.length) ch.send(`**Alert B**\n${pack(hitsB)}`);
      if (hitsC.length) ch.send(`**Alert C**\n${pack(hitsC)}`);
      if (hitsD.length) ch.send(`**Alert D**\n${pack(hitsD)}`);
      if (hitsE.length)
        ch.send(`**Alert E — Xmas25**\n${pack(hitsE)}`);
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

