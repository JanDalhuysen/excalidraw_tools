import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseExcalidrawScore } from "./score_parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve generated wav files if requested
app.use("/audio", express.static(path.join(__dirname)));

// ============================================================
// Live Excalidraw Sync
// Watches a folder for .excalidraw.md score files and pushes
// parsed notes to the browser over Server-Sent Events, so edits
// made in Obsidian / Excalidraw appear in the Mini DAW.
// Set the SCORE_DIR env var to point at a folder inside your
// Obsidian vault to sync files directly from Obsidian.
// ============================================================
const LIVE_DIR = process.env.SCORE_DIR || path.join(__dirname, "live");
fs.mkdirSync(LIVE_DIR, { recursive: true });

const sseClients = new Set();
let lastPayloadJson = "";

// The "active" score is the most recently modified .excalidraw.md
function findActiveScoreFile() {
  let newest = null;
  for (const name of fs.readdirSync(LIVE_DIR)) {
    if (!name.endsWith(".excalidraw.md")) continue;
    const filePath = path.join(LIVE_DIR, name);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && (!newest || stat.mtimeMs > newest.mtimeMs)) {
        newest = { filePath, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // file may have just been deleted
    }
  }
  return newest ? newest.filePath : null;
}

function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res); // client went away mid-write
    }
  }
}

function syncFromDisk() {
  const filePath = findActiveScoreFile();
  if (!filePath) return;
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  const parsed = parseExcalidrawScore(markdown);
  if (!parsed) return; // not a Mini DAW score
  const payload = {
    type: "score",
    file: path.basename(filePath),
    notes: parsed.notes,
    totalBars: parsed.totalBars,
  };
  const json = JSON.stringify(payload);
  if (json === lastPayloadJson) return; // nothing changed
  lastPayloadJson = json;
  broadcast(payload);
  console.log(`[live-sync] ${path.basename(filePath)} -> ${parsed.notes.length} notes sent to ${sseClients.size} client(s)`);
}

// SSE stream consumed by public/live_sync.js
app.get("/api/live-events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");
  if (lastPayloadJson) res.write(`data: ${lastPayloadJson}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// Receive the current score from the DAW and write it into the live folder
app.post("/api/live-score", express.text({ type: () => true, limit: "10mb" }), (req, res) => {
  if (typeof req.body !== "string" || !req.body.includes("excalidraw")) {
    return res.status(400).json({ ok: false, error: "Expected .excalidraw.md content" });
  }
  const filePath = path.join(LIVE_DIR, "score.excalidraw.md");
  fs.writeFileSync(filePath, req.body, "utf8");
  console.log(`[live-sync] Score pushed from DAW -> ${filePath}`);
  syncFromDisk();
  res.json({ ok: true, file: filePath });
});

// Keep SSE connections alive through proxies
setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(": ping\n\n");
    } catch {
      sseClients.delete(res);
    }
  }
}, 25000);

// Watch the live folder (debounced — Obsidian saves in bursts)
let syncTimer = null;
fs.watch(LIVE_DIR, () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncFromDisk, 600);
});

// Initial scan on startup
syncFromDisk();

app.listen(PORT, () => {
  console.log(`\nMini-DAW Piano Roll is running!`);
  console.log(`Open in your browser: http://localhost:${PORT}`);
  console.log(`\nLive Excalidraw sync watching: ${LIVE_DIR}`);
  console.log(`Set the SCORE_DIR env var to point at your Obsidian vault instead.\n`);
});
