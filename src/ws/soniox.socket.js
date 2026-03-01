import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import Waiter from "../models/Waiter.js";
import storageService from "../services/minio.service.js";
import { createSonioxSocket } from "../services/soniox.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WAV_HEADER_BYTES = 44;
const PRIME_CHUNK_BYTES = 640;
const PRIME_CHUNK_INTERVAL_MS = 20;

const wss = new WebSocketServer({ noServer: true });

function getWaiterEmailFromRequest(req) {
  if (!req?.url) return null;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const email = url.searchParams.get("email");
    return email && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

async function loadWaiterAudioFromMinio(audioPath) {
  if (!audioPath || typeof audioPath !== "string") return { pcmBuffer: null };
  try {
    const raw = await storageService.downloadAudioBuffer(audioPath);
    if (!raw || raw.length === 0) return { pcmBuffer: null };
    const ext = path.extname(audioPath).toLowerCase();
    const name = path.basename(audioPath);
    if (ext === ".wav" && raw.length > WAV_HEADER_BYTES) {
      return { pcmBuffer: raw.subarray(WAV_HEADER_BYTES), sourceLabel: `waiter WAV (${name})` };
    }
    if (ext === ".pcm") {
      return { pcmBuffer: raw, sourceLabel: `waiter PCM (${name})` };
    }
    return { pcmBuffer: raw, sourceLabel: `waiter file (${name})` };
  } catch (err) {
    console.warn("[Soniox] MinIO download failed:", audioPath, err?.message);
    return { pcmBuffer: null };
  }
}

function streamPcmToSocket(ws, pcmBuffer) {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const interval = setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        clearInterval(interval);
        reject(new Error("Socket closed during prime"));
        return;
      }
      const chunk = pcmBuffer.slice(offset, offset + PRIME_CHUNK_BYTES);
      if (chunk.length === 0) {
        clearInterval(interval);
        resolve();
        return;
      }
      ws.send(chunk);
      offset += PRIME_CHUNK_BYTES;
    }, PRIME_CHUNK_INTERVAL_MS);
  });
}

async function primeWaiterVoice(sonioxWs, waiterEmail) {
  let pcmBuffer = null;
  let sourceLabel = "";

  if (waiterEmail) {
    const waiter = await Waiter.query().select("audio_path").findOne({ email: waiterEmail });
    if (waiter?.audio_path) {
      const result = await loadWaiterAudioFromMinio(waiter.audio_path);
      if (result.pcmBuffer) {
        pcmBuffer = result.pcmBuffer;
        sourceLabel = result.sourceLabel;
      }
    }
  }

  if (!pcmBuffer || pcmBuffer.length === 0) {
    console.warn("[Soniox] No waiter audio for priming — skipping");
    return;
  }

  console.log(
    `[Soniox] Priming with ${sourceLabel}: ${pcmBuffer.length} bytes (~${(pcmBuffer.length / 32000).toFixed(1)}s)`
  );
  await streamPcmToSocket(sonioxWs, Buffer.from(pcmBuffer));
  console.log("[Soniox] Priming done — live stream taking over");
}

wss.on("connection", (clientWs, req) => {
  console.log("[Soniox] Browser connected");
  const waiterEmail = getWaiterEmailFromRequest(req);

  let priming = true;
  const liveBuffer = [];
  let sonioxWs = null;

  sonioxWs = createSonioxSocket(clientWs);

  sonioxWs.once("open", () => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ message: "PrimingStarted" }));
    }
    primeWaiterVoice(sonioxWs, waiterEmail)
      .catch((err) => console.error("[Soniox] Priming failed:", err?.message))
      .finally(() => {
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "PrimingComplete" }));
        }
        for (const chunk of liveBuffer) {
          if (sonioxWs && sonioxWs.readyState === sonioxWs.OPEN) {
            sonioxWs.send(chunk);
          }
        }
        liveBuffer.length = 0;
        priming = false;
      });
  });

  clientWs.on("message", (data) => {
    if (priming) {
      liveBuffer.push(data);
    } else if (sonioxWs && sonioxWs.readyState === sonioxWs.OPEN) {
      sonioxWs.send(data);
    }
  });

  clientWs.on("close", () => {
    console.log("[Soniox] Browser disconnected");
    if (sonioxWs && sonioxWs.readyState === sonioxWs.OPEN) {
      sonioxWs.send(Buffer.alloc(0));
      sonioxWs.close();
    }
  });

  clientWs.on("error", (err) => console.error("[Soniox] Client error:", err));
});

export { wss as sonioxWss };
export function handleSonioxConnection() {}
