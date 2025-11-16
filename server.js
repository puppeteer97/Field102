import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import express from "express";
import "./keepalive.js"; // start keep-alive pinger
import "./monitor.js";   // start Nairi monitor

// Small web server (Render requirement)
const app = express();
app.get("/", (req, res) => res.send("Nairi Monitor Running."));
app.listen(3000, () => console.log("Keep-alive server running on port 3000"));
