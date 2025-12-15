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
const ALERT_A_RIGHT_MAX = 200;

const ALERT_B_LEFT_MIN = 30;
const ALERT_B_RIGHT_MAX = 400;

const ALERT_C_RIGHT_MAX = 100;

const ALERT_CHANNEL_ID = process.env.CHANNEL_ID || null;

const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

const KEEPALIVE_URL =
  process.env.KEEPALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  null;

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
// PARSER
//---------------------------------------------------------
function parseRow(line) {
  if (!line.includes("¦")) return null;

  const matches = [...line.matchAll(/` *(\d{1,5}) *`/g)];
  if (matches.length < 2) return null;

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
// SHARD EVENTS
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
    // ADDITIONAL ALERT E — Xmas25 ONLY
    //-----------------------------------------------------

    const rawLines = msg.content.split(/\r?\n/);

    const hitsE = rawLines
      .map(line => {
        const parsed = parseRow(line);
        if (!parsed) return null;

        if (parsed.left >= 20 && /Xmas25/i.test(line)) {
          return parsed;
        }
        return null;
      })
      .filter(Boolean);

    //-----------------------------------------------------
    // LOGGING
    //-----------------------------------------------------
    if (hitsA.length) console.log("ALERT A:", hitsA);
    if (hitsB.length) console.log("ALERT B:", hitsB);
    if (hitsC.length) console.log("ALERT C:", hitsC);
    if (hitsD.length) console.log("ALERT D:", hitsD);
    if (hitsE.length) console.log("ALERT E (Xmas25):", hitsE);

    if (
      !hitsA.length &&
      !hitsB.length &&
      !hitsC.length &&
      !hitsD.length &&
      !hitsE.length
    ) return;

    const pack = hits => hits.map(h => `(${h.left} / ${h.right})`).join("\n");

    //-----------------------------------------------------
    // PUSHOVER
    //-----------------------------------------------------
    if (hitsA.length) await sendPushover("Alert A:\n" + pack(hitsA));
    if (hitsB.length) await sendPushover("Alert B:\n" + pack(hitsB));
    if (hitsC.length) await sendPushover("Alert C:\n" + pack(hitsC));
    if (hitsD.length) await sendPushover("Alert D:\n" + pack(hitsD));
    if (hitsE.length)
      await sendPushover("Alert E — Xmas25:\n" + pack(hitsE));

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
