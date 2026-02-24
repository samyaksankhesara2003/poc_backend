import { WebSocketServer } from "ws";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatricsV2.service.js";
import { AudioAnalysisBridge } from "../services/audioAnalysis.service.js";
import { ContentAnalyzer } from "../services/contentAnalysis.service.js";
import { ToneClassifier } from "../services/toneClassification.service.js";
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

function getLanguageFromRequest(req) {
  if (!req?.url) return null;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const lang = url.searchParams.get("lang") || url.searchParams.get("language");
    return lang && ["en", "es"].includes(lang.toLowerCase()) ? lang.toLowerCase() : null;
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

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(typeof data === "string" ? data : JSON.stringify(data));
  }
}

wss.on("connection", (clientWs, req) => {
  console.log("🌐 Browser connected");
  const waiterEmail = getWaiterEmailFromRequest(req);
  
  // Extract language from query params (default: "en")
  const language = getLanguageFromRequest(req) || "en";

  let priming = true;
  const smWs = createSpeechmaticsSocketModify(clientWs, language);
  const liveBuffer = [];

  // ── LLM tone classifier (transcript + acoustic metrics → GPT-4o-mini) ──
  const toneClassifier = new ToneClassifier((result) => {
    safeSend(clientWs, { message: "ToneClassification", ...result });
  });

  // ── Acoustic metrics bridge (audio → Python analyzer) ──
  const analysisBridge = new AudioAnalysisBridge((result) => {
    safeSend(clientWs, { message: "AudioMetrics", ...result });
    if (result.audio_metrics) {
      toneClassifier.setAcousticMetrics(result.audio_metrics);
    }
  });
  analysisBridge.connect();

  // ── Content analysis (transcript → OpenAI) ──
  const contentAnalyzer = new ContentAnalyzer((result) => {
    safeSend(clientWs, { message: "ContentAnalysis", ...result });
  });

  // Intercept Speechmatics transcripts to feed content analyzer
  const originalOnMessage = smWs.listeners("message");
  smWs.removeAllListeners("message");

  smWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.message === "AddTranscript") {
        clientWs.send(JSON.stringify(message));

        const results = message.results;
        if (results?.length) {
          const segments = [];
          for (const r of results) {
            const content = r.alternatives?.[0]?.content;
            const speaker = r.alternatives?.[0]?.speaker || "S1";
            if (content == null) continue;
            const isPunc = /^[.,!?;:'"\s]+$/.test((content || "").trim());

            // Feed non-punctuation words to the LLM tone classifier
            if (!isPunc) {
              toneClassifier.addText(speaker, content);
            }

            const role = speaker === "S1" ? "WAITER" : "CUSTOMER";
            if (segments.length > 0 && segments[segments.length - 1].role === role) {
              const last = segments[segments.length - 1];
              last.text += isPunc ? content : (last.text ? " " : "") + content;
            } else {
              segments.push({ role, text: content });
            }
          }
          if (segments.length > 0) {
            contentAnalyzer.addSegments(segments);
          }
        }
      }

      if (message.message === "EndOfTranscript") {
        console.log("🛑 Transcription finished");
        toneClassifier.flush();
        contentAnalyzer.forceAnalyze();
      }
    } catch (err) {
      console.error("Speechmatics parse error:", err);
    }
  });

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
    // Fork audio: send to Speechmatics AND the tone analyzer
    analysisBridge.sendAudio(audioChunk);

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
    analysisBridge.close();
    toneClassifier.flush().then(() => toneClassifier.close());
    contentAnalyzer.forceAnalyze().then(() => contentAnalyzer.close());
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
