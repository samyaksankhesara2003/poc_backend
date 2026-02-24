import { WebSocketServer } from "ws";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatricsV2.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Waiter from "../models/Waiter.js";
import storageService from "../services/minio.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEGACY_WAITER_PCM_PATH = path.resolve(
  __dirname,
  "../../recordings/recording.pcm",
);
const WAV_HEADER_BYTES = 44;

// 20ms chunks at 16kHz 16-bit mono (640 bytes = 20ms)
const PRIME_CHUNK_BYTES = 640;
const PRIME_CHUNK_INTERVAL_MS = 20;
const SILENCE_MS = 1000;
const SILENCE_BUFFER = Buffer.alloc(SILENCE_MS * 32, 0);

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

/* ─── Previous: load waiter audio from local filesystem ───
function resolveWaiterAudioPath(audioPath) {
  if (!audioPath || typeof audioPath !== "string") return null;
  const absolute = path.isAbsolute(audioPath)
    ? audioPath
    : path.join(process.cwd(), audioPath);
  return fs.existsSync(absolute) ? absolute : null;
}
*/

wss.on("connection", (clientWs, req) => {
  console.log("🌐 Browser connected");
  const waiterEmail = getWaiterEmailFromRequest(req);

  let priming = true;
  const smWs = createSpeechmaticsSocketModify(clientWs);
  const liveBuffer = [];
  
  smWs.once("open", () => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ message: "PrimingStarted" }));
    }
    primeWaiterVoice(smWs, waiterEmail)
      .catch((err) => console.error("❌ Priming failed:", err.message))
      .finally(() => {
        console.log("✅ Priming done — flushing buffered live audio");
        priming = false;
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "PrimingComplete" }));
        }
        for (const chunk of liveBuffer) {
          if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
        }
        liveBuffer.length = 0;
      });
  });

  clientWs.on("message", (audioChunk) => {
    if (priming) {
      liveBuffer.push(audioChunk);
    } else if (smWs.readyState === smWs.OPEN) {
      smWs.send(audioChunk);
    }
  });

  clientWs.on("close", () => {
    console.log("❌ Browser disconnected");
    if (smWs.readyState === smWs.OPEN) {
      smWs.send(JSON.stringify({ message: "EndOfStream" }));
    }
    smWs.close();
  });

  clientWs.on("error", (err) => console.error("Client error:", err));
});

export { wss as speechMatrixWss };
export function handleSpeechMatrixConnection() { }

// ─── Priming ─────────────────────────────────────────────────────────────────

/**
 * Load waiter audio from MinIO using downloadAudioBuffer (key e.g. waiteraudio/samyak.wav).
 * Returns { pcmBuffer, sourceLabel } or { pcmBuffer: null } on failure.
 */
async function loadWaiterAudioFromMinio(audioPath) {
  if (!audioPath || typeof audioPath !== "string") return { pcmBuffer: null };
  const raw = await storageService.downloadAudioBuffer(audioPath);
  if (!raw || raw.length === 0) return { pcmBuffer: null };
  const ext = path.extname(audioPath).toLowerCase();
  const name = path.basename(audioPath);
  if (ext === ".wav" && raw.length > WAV_HEADER_BYTES) {
    return {
      pcmBuffer: raw.subarray(WAV_HEADER_BYTES),
      sourceLabel: `waiter WAV (${name})`,
    };
  }
  return { pcmBuffer: raw, sourceLabel: `waiter file (${name})` };
}

async function primeWaiterVoice(smWs, waiterEmail) {
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
    console.warn("⚠️  No waiter audio for priming (MinIO) — skipping");
    return;
  }

  console.log(
    `🎙 Priming with ${sourceLabel}: ${pcmBuffer.length} bytes (~${(pcmBuffer.length / 32000).toFixed(1)}s)`,
  );
  await streamPcmRealtime(smWs, Buffer.from(pcmBuffer));
  await sendSilence(smWs);
  console.log("🟢 Waiter PCM + silence sent — live stream taking over");
}

// ─── Previous priming: load from local filesystem via resolveWaiterAudioPath ───
// async function primeWaiterVoice(smWs, waiterEmail) {
//   let pcmBuffer = null;
//   let sourceLabel = "";
//   if (waiterEmail) {
//     const waiter = await Waiter.query().select("audio_path").findOne({ email: waiterEmail });
//     if (waiter?.audio_path) {
//       const absolutePath = resolveWaiterAudioPath(waiter.audio_path);
//       if (absolutePath) {
//         const raw = fs.readFileSync(absolutePath);
//         const ext = path.extname(absolutePath).toLowerCase();
//         if (ext === ".wav" && raw.length > WAV_HEADER_BYTES) {
//           pcmBuffer = raw.subarray(WAV_HEADER_BYTES);
//           sourceLabel = `waiter WAV (${path.basename(absolutePath)})`;
//         } else {
//           pcmBuffer = raw;
//           sourceLabel = `waiter file (${path.basename(absolutePath)})`;
//         }
//       }
//     }
//   }
//   if (!pcmBuffer && fs.existsSync(LEGACY_WAITER_PCM_PATH)) {
//     pcmBuffer = fs.readFileSync(LEGACY_WAITER_PCM_PATH);
//     sourceLabel = "legacy recording.pcm";
//   }
//   if (!pcmBuffer || pcmBuffer.length === 0) {
//     console.warn("⚠️  No waiter audio for priming — skipping");
//     return;
//   }
//   console.log(`🎙 Priming with ${sourceLabel}: ...`);
//   await streamPcmRealtime(smWs, Buffer.from(pcmBuffer));
//   await sendSilence(smWs);
//   console.log("🟢 Waiter PCM + silence sent — live stream taking over");
// }

function streamPcmRealtime(smWs, pcmBuffer) {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const interval = setInterval(() => {
      if (smWs.readyState !== smWs.OPEN) {
        clearInterval(interval);
        reject(new Error("SM socket closed during prime"));
        return;
      }
      const chunk = pcmBuffer.slice(offset, offset + PRIME_CHUNK_BYTES);
      if (chunk.length === 0) {
        clearInterval(interval);
        resolve();
        return;
      }
      smWs.send(chunk);
      offset += PRIME_CHUNK_BYTES;
    }, PRIME_CHUNK_INTERVAL_MS);
  });
}

function sendSilence(smWs) {
  return new Promise((resolve) => {
    if (smWs.readyState !== smWs.OPEN) {
      resolve();
      return;
    }
    smWs.send(SILENCE_BUFFER, resolve);
  });
}