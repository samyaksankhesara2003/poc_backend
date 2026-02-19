import { WebSocketServer } from "ws";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatricsV2.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WAITER_PCM_PATH = path.resolve(
  __dirname,
  "../../recordings/recording.pcm",
);

// 20ms chunks at 16kHz 16-bit mono (640 bytes = 20ms)
const PRIME_CHUNK_BYTES = 640;
const PRIME_CHUNK_INTERVAL_MS = 20;

// 800ms silence after prime — gives SM time to settle S1 voiceprint
// before live audio begins. Adjust up if still getting S2 for waiter.
const SILENCE_MS = 1000;
const SILENCE_BUFFER = Buffer.alloc(SILENCE_MS * 32, 0); // 32 bytes/ms @ 16kHz 16-bit mono

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (clientWs) => {
  console.log("🌐 Browser connected");

  let priming = true;
  const smWs = createSpeechmaticsSocketModify(clientWs);

  // Buffer live mic chunks that arrive DURING priming — drain after prime done
  const liveBuffer = [];

  smWs.once("open", () => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ message: "PrimingStarted" }));
    }
    primeWaiterVoice(smWs)
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

async function primeWaiterVoice(smWs) {
  if (!fs.existsSync(WAITER_PCM_PATH)) {
    console.warn(
      "⚠️  No waiter recording at",
      WAITER_PCM_PATH,
      "— skipping prime",
    );
    return;
  }

  const pcmData = fs.readFileSync(WAITER_PCM_PATH);
  console.log(
    `🎙 Priming waiter voice: ${pcmData.length} bytes (~${(pcmData.length / 32000).toFixed(1)}s)`,
  );

  await streamPcmRealtime(smWs, pcmData);

  // Short silence so SM can settle the S1 voiceprint before live audio hits
  await sendSilence(smWs);
  console.log("🟢 Waiter PCM + silence sent — live stream taking over");
}

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