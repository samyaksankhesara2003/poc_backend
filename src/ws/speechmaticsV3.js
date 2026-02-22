import { WebSocketServer } from "ws";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatricsV2.service.js";
import { toneService } from "../services/tone.service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Waiter from "../models/Waiter.js";

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

// 16kHz 16-bit mono: 32000 bytes per second
const BYTES_PER_SECOND = 32000;
const PCM_BUFFER_RETENTION_SEC = 120;

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

function resolveWaiterAudioPath(audioPath) {
  if (!audioPath || typeof audioPath !== "string") return null;
  const absolute = path.isAbsolute(audioPath)
    ? audioPath
    : path.join(process.cwd(), audioPath);
  return fs.existsSync(absolute) ? absolute : null;
}

wss.on("connection", (clientWs, req) => {
  console.log("🌐 Browser connected");
  const waiterEmail = getWaiterEmailFromRequest(req);

  let priming = true;
  const pcmChunks = [];
  let streamTimeSec = 0;

  function getAudioSlice(startTimeSec, endTimeSec) {
    if (startTimeSec >= endTimeSec || pcmChunks.length === 0) return null;
    const parts = [];
    for (const { startTime, data } of pcmChunks) {
      const chunkEndTime = startTime + data.length / BYTES_PER_SECOND;
      if (chunkEndTime <= startTimeSec || startTime >= endTimeSec) continue;
      const sliceStartByte = Math.max(0, Math.floor((startTimeSec - startTime) * BYTES_PER_SECOND));
      const sliceEndByte = Math.min(data.length, Math.ceil((endTimeSec - startTime) * BYTES_PER_SECOND));
      if (sliceEndByte > sliceStartByte) parts.push(Buffer.from(data.subarray(sliceStartByte, sliceEndByte)));
    }
    return parts.length ? Buffer.concat(parts) : null;
  }

  function appendPcm(chunk) {
    const startTime = streamTimeSec;
    streamTimeSec += chunk.length / BYTES_PER_SECOND;
    pcmChunks.push({ startTime, data: Buffer.from(chunk) });
    while (pcmChunks.length > 0 && streamTimeSec - pcmChunks[0].startTime > PCM_BUFFER_RETENTION_SEC) {
      pcmChunks.shift();
    }
  }

  async function onAddTranscript(ws, message, getSlice) {
    const results = message.results;
    const metadata = message.metadata || {};
    if (!results || !Array.isArray(results)) return;

    const bySpeaker = new Map();
    for (const r of results) {
      const speaker = r.alternatives?.[0]?.speaker || "S1";
      const content = r.alternatives?.[0]?.content;
      const start = r.start_time ?? metadata.start_time;
      const end = r.end_time ?? metadata.end_time;
      if (content == null) continue;
      if (!bySpeaker.has(speaker)) bySpeaker.set(speaker, { start, end, parts: [] });
      const seg = bySpeaker.get(speaker);
      seg.start = Math.min(seg.start, start);
      seg.end = Math.max(seg.end, end);
      seg.parts.push(content);
    }

    for (const [speaker, { start, end, parts }] of bySpeaker) {
      const text = parts.join(" ").trim();
      if (!text) continue;
      const audioChunk = getSlice(start, end);
      try {
        const { tone, emotion, textSentiment } = await toneService.runTonePipeline(audioChunk, text);
        
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            message: "ToneUpdate",
            speaker,
            tone,
            emotion,
            textSentiment,
            text: text.slice(0, 80),
          }));
        }
      } catch (err) {
        console.error("Tone pipeline error:", err.message);
      }
    }
  }

  const smWs = createSpeechmaticsSocketModify(clientWs, {
    getAudioSlice: getAudioSlice,
    onAddTranscript: onAddTranscript,
  });
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
          appendPcm(chunk);
          if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
        }
        liveBuffer.length = 0;
      });
  });

  clientWs.on("message", (audioChunk) => {
    if (priming) {
      liveBuffer.push(audioChunk);
    } else {
      appendPcm(audioChunk);
      if (smWs.readyState === smWs.OPEN) smWs.send(audioChunk);
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

async function primeWaiterVoice(smWs, waiterEmail) {
  let pcmBuffer = null;
  let sourceLabel = "";

  if (waiterEmail) {
    const waiter = await Waiter.query().select("audio_path").findOne({ email: waiterEmail });
    if (waiter?.audio_path) {
      const absolutePath = resolveWaiterAudioPath(waiter.audio_path);
      if (absolutePath) {
        const raw = fs.readFileSync(absolutePath);
        const ext = path.extname(absolutePath).toLowerCase();
        if (ext === ".wav" && raw.length > WAV_HEADER_BYTES) {
          pcmBuffer = raw.subarray(WAV_HEADER_BYTES);
          sourceLabel = `waiter WAV (${path.basename(absolutePath)})`;
        } else {
          pcmBuffer = raw;
          sourceLabel = `waiter file (${path.basename(absolutePath)})`;
        }
      }
    }
  }

  if (!pcmBuffer && fs.existsSync(LEGACY_WAITER_PCM_PATH)) {
    pcmBuffer = fs.readFileSync(LEGACY_WAITER_PCM_PATH);
    sourceLabel = "legacy recording.pcm";
  }

  if (!pcmBuffer || pcmBuffer.length === 0) {
    console.warn("⚠️  No waiter audio for priming — skipping");
    return;
  }

  console.log(
    `🎙 Priming with ${sourceLabel}: ${pcmBuffer.length} bytes (~${(pcmBuffer.length / 32000).toFixed(1)}s)`,
  );
  await streamPcmRealtime(smWs, Buffer.from(pcmBuffer));
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