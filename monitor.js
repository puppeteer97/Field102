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
const ALERT_A_LEFT_MIN = 5;
const ALERT_A_RIGHT_MAX = 500;

const ALERT_B_LEFT_MIN = 15;
const ALERT_B_RIGHT_MAX = 1000;

const ALERT_C_RIGHT_MAX = 100; // irrespective of left

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
    console.log("
