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

// import { WebSocketServer } from "ws";
// import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatricsV2.service.js";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

// // Path to the saved waiter PCM recording
// const WAITER_PCM_PATH = path.resolve(__dirname, "../../recordings/recording.pcm");

// // Silence: 16kHz 16-bit mono = 32 bytes/ms → 1500ms silence between prime and live
// const SILENCE_BUFFER = Buffer.alloc(1500 * 32, 0);

// // Stream waiter PCM in 20ms real-time chunks (640 bytes = 20ms @ 16kHz 16-bit mono)
// const PRIME_CHUNK_BYTES = 640;
// const PRIME_CHUNK_INTERVAL_MS = 20;

// // Speaker label map: S1 = Waiter (primed first), all others = Customer
// function getSpeakerLabel(speakerId) {
//     return speakerId === "S1" ? "Waiter" : "Customer";
// }

// // noServer:true — server.js routes upgrades manually
// const wss = new WebSocketServer({ noServer: true });

// wss.on("connection", (clientWs) => {
//     console.log("🌐 Browser connected");

//     const smWs = createSpeechmaticsSocketModify(clientWs, getSpeakerLabel);

//     // Once SM is open: prime waiter voice, then signal frontend to start mic
//     smWs.once("open", () => {
//         primeWaiterVoice(smWs)
//             .catch((err) => console.error("❌ Priming failed:", err.message))
//             .finally(() => {
//                 console.log("✅ Waiter primed — signalling frontend to start mic");
//                 if (clientWs.readyState === clientWs.OPEN) {
//                     clientWs.send(JSON.stringify({ message: "PrimingComplete" }));
//                 }
//             });
//     });

//     // Live mic audio from frontend → forward to Speechmatics
//     clientWs.on("message", (audioChunk) => {
//         if (smWs.readyState === smWs.OPEN) {
//             smWs.send(audioChunk);
//         }
//     });

//     clientWs.on("close", () => {
//         console.log("❌ Browser disconnected");
//         if (smWs.readyState === smWs.OPEN) {
//             smWs.send(JSON.stringify({ message: "EndOfStream" }));
//         }
//         smWs.close();
//     });

//     clientWs.on("error", (err) => console.error("Client error:", err));
// });

// export { wss as speechMatrixWss };
// export function handleSpeechMatrixConnection() {} // kept so server.js import stays unchanged

// // ─── Priming helpers ─────────────────────────────────────────────────────────

// async function primeWaiterVoice(smWs) {
//     if (!fs.existsSync(WAITER_PCM_PATH)) {
//         console.warn("⚠️  No waiter recording at", WAITER_PCM_PATH, "— skipping prime");
//         return;
//     }

//     const pcmData = fs.readFileSync(WAITER_PCM_PATH);
//     console.log(`🎙 Streaming waiter prime: ${pcmData.length} bytes`);

//     await streamPcmRealtime(smWs, pcmData);

//     console.log("⏸  Sending silence gap...");
//     await sendSilence(smWs);
// }

// function streamPcmRealtime(smWs, pcmBuffer) {
//     return new Promise((resolve, reject) => {
//         let offset = 0;
//         const interval = setInterval(() => {
//             if (smWs.readyState !== smWs.OPEN) {
//                 clearInterval(interval);
//                 reject(new Error("SM socket closed during prime"));
//                 return;
//             }
//             const chunk = pcmBuffer.slice(offset, offset + PRIME_CHUNK_BYTES);
//             if (chunk.length === 0) { clearInterval(interval); resolve(); return; }
//             smWs.send(chunk);
//             offset += PRIME_CHUNK_BYTES;
//         }, PRIME_CHUNK_INTERVAL_MS);
//     });
// }

// function sendSilence(smWs) {
//     return new Promise((resolve) => {
//         if (smWs.readyState !== smWs.OPEN) { resolve(); return; }
//         smWs.send(SILENCE_BUFFER, resolve);
//     });
// }
