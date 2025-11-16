import fetch from "node-fetch";

const URL = process.env.RENDER_EXTERNAL_URL;

if (!URL) {
    console.log("No RENDER_EXTERNAL_URL set.");
}

setInterval(() => {
    if (URL) {
        fetch(URL).catch(() => {});
        console.log("Ping:", URL);
    }
}, 4 * 60 * 1000); // every 4 minutes
