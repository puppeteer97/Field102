import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// -------------------------
// CONFIG / RULES
// -------------------------
// You gave this bot id; still allow override via env if desired
const APP_BOT_ID = process.env.APP_BOT_ID || "1312830013573169252";

// Main rule: left >= RULE_LEFT_MIN AND right < RULE_RIGHT_MAX
const RULE_LEFT_MIN = parseInt(process.env.RULE_LEFT_MIN || "3", 10);
const RULE_RIGHT_MAX = parseInt(process.env.RULE_RIGHT_MAX || "800", 10);

// Channel to post alerts to (set in Render env)
const ALERT_CHANNEL_ID = process.env.CHANNEL_ID;

// Pushover credentials (set in Render env)
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER = process.env.PUSHOVER_USER;

// Optional: role mention to prefix alert (e.g. "<@&ROLE_ID>" or a username). Keep empty to avoid mention.
const NOTIFY_PREFIX = process.env.NOTIFY_PREFIX || "";

// Keepalive URL (optional) — set to your render URL to self-ping
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || null;

// -------------------------
// CLIENT
// -------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// -------------------------
// Keep-alive pinger (optional)
// -------------------------
if (KEEPALIVE_URL) {
  setInterval(() => {
    fetch(KEEPALIVE_URL).catch(() => {});
    console.log("Keepalive ping to", KEEPALIVE_URL);
  }, 4 * 60 * 1000); // every 4 minutes
}

// -------------------------
// Helper: extract pairs from a single line
// -------------------------
function extractFromLine(line) {
  // normalize whitespace
  const normalized = line.replace(/\u200B/g, "").replace(/\s+/g, " ").trim();

  // Only consider lines that visually look like a Nairi row
  if (!normalized.includes("¦")) return null;

  // First try: backticked numbers ` 123 `
  const backtickNums = [...normalized.matchAll(/` *(\d{1,5}) *`/g)].map(m => parseInt(m[1], 10));
  let left = null, right = null;

  if (backtickNums.length >= 2) {
    left = backtickNums[0];
    right = backtickNums[1];
  } else {
    // Fallback: capture all standalone numbers and pick first and last
    const plainNums = [...normalized.matchAll(/\b(\d{1,5})\b/g)].map(m => parseInt(m[1], 10));
    if (plainNums.length >= 2) {
      left = plainNums[0];
      right = plainNums[plainNums.length - 1];
    } else {
      return null;
    }
  }

  // Extract name: usually after the last "¦"
  let parts = normalized.split("¦").map(p => p.trim()).filter(Boolean);
  let namePart = parts.length ? parts[parts.length - 1] : "";

  // Remove markdown bold/italics and trailing "· Source" if present
  // e.g. "**Michika Takezuka** · *Heavenly Delusion*"
  namePart = namePart.replace(/^\*\*(.+?)\*\*$/, "$1");            // bold only
  namePart = namePart.replace(/\*(.+)\*/g, "$1");                  // italics
  namePart = namePart.replace(/·.*/, "").trim();                   // drop "· Source"
  namePart = namePart.replace(/^[`'"]+|[`'"]+$/g, "").trim();      // trim stray quotes/backticks

  // Final sanity checks
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return { left, right, name: namePart || null };
  }
  return null;
}

// -------------------------
// Message parsing: returns array of {left,right,name}
// -------------------------
function parseNairiMessage(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text.split(/\r?\n/);
  const results = [];
  for (const rawLine of lines) {
    // Many messages include emoji tokens like <:narrow_a:123> at the start — keep them, extractFromLine handles numbers
    const item = extractFromLine(rawLine);
    if (item) results.push(item);
  }
  return results;
}

// -------------------------
// Send Pushover
// -------------------------
async function sendPushover(message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    console.warn("Pushover credentials missing; skipping notification:", message);
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
    const txt = await res.text();
    console.log("[Pushover] response:", res.status, txt);
  } catch (err) {
    console.error("[Pushover] error:", err);
  }
}

// -------------------------
// Main handler
// -------------------------
client.on("messageCreate", async (msg) => {
  try {
    // Ignore everything not from the Nairi app/bot
    if (!msg.author || String(msg.author.id) !== String(APP_BOT_ID)) return;

    // Quick guard: must contain some '¦' separators used in Nairi rows
    if (!msg.content || !msg.content.includes("¦")) return;

    const parsed = parseNairiMessage(msg.content);
    if (!parsed.length) return;

    // Filter by rule and prepare notifications
    const hits = parsed.filter(p => p.left >= RULE_LEFT_MIN && p.right < RULE_RIGHT_MAX);

    if (!hits.length) return;

    // Build message body (include character + left/right)
    const lines = hits.map(h => `(${h.left} / ${h.right}) — ${h.name || "Unknown"}`);
    const body = `Nairi Match Found:\n${lines.join("\n")}`;

    console.log("Matches:", hits, "-> sending notification");

    // Send Pushover
    await sendPushover(body);

    // Also post into an alerts channel if provided
    if (ALERT_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(ALERT_CHANNEL_ID);
        if (channel && channel.send) {
          await channel.send(`${NOTIFY_PREFIX} **Nairi Match Found**\n${lines.join("\n")}`);
        }
      } catch (err) {
        console.warn("Could not post to alert channel:", err.message);
      }
    }

  } catch (err) {
    console.error("Handler error:", err);
  }
});

// -------------------------
// READY
// -------------------------
client.once("ready", () => {
  console.log("Bot ready:", client.user?.tag || "(unknown)");
});

// -------------------------
// LOGIN
// -------------------------
if (!process.env.BOT_TOKEN) {
  console.error("Missing BOT_TOKEN env var. Set it in Render.");
} else {
  client.login(process.env.BOT_TOKEN).catch(err => {
    console.error("Login failed:", err);
  });
}



