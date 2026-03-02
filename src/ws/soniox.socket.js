import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import Waiter from "../models/Waiter.js";
import storageService from "../services/minio.service.js";
import { createSonioxSocket } from "../services/soniox.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/**
 * Download waiter audio from MinIO and return the raw buffer as-is.
 * Soniox uses audio_format: "auto" so no header stripping or format conversion needed.
 */
async function loadWaiterAudioFromMinio(audioPath) {
  if (!audioPath || typeof audioPath !== "string") return { audioBuffer: null };
  try {
    const raw = await storageService.downloadAudioBuffer(audioPath);
    if (!raw || raw.length === 0) return { audioBuffer: null };
    const name = path.basename(audioPath);
    return { audioBuffer: raw, sourceLabel: `waiter audio (${name})` };
  } catch (err) {
    console.warn("[Soniox] MinIO download failed:", audioPath, err?.message);
    return { audioBuffer: null };
  }
}

function streamAudioToSocket(ws, audioBuffer) {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const interval = setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        clearInterval(interval);
        reject(new Error("Socket closed during prime"));
        return;
      }
      const chunk = audioBuffer.slice(offset, offset + PRIME_CHUNK_BYTES);
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
  let audioBuffer = null;
  let sourceLabel = "";

  if (waiterEmail) {
    const waiter = await Waiter.query().select("audio_path").findOne({ email: waiterEmail });
    if (waiter?.audio_path) {
      const result = await loadWaiterAudioFromMinio(waiter.audio_path);
      if (result.audioBuffer) {
        audioBuffer = result.audioBuffer;
        sourceLabel = result.sourceLabel;
      }
    }
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    console.warn("[Soniox] No waiter audio for priming — skipping");
    return;
  }

  console.log(
    `[Soniox] Priming with ${sourceLabel}: ${audioBuffer.length} bytes`
  );
  await streamAudioToSocket(sonioxWs, Buffer.from(audioBuffer));
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
export function handleSonioxConnection() { }
