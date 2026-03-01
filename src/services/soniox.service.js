import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

const DEFAULT_CONFIG = {
  api_key: process.env.SONIOX_API_KEY,
  model: "stt-rt-v4",
  audio_format: "pcm_s16le",
  sample_rate: 16000,
  num_channels: 1,
  language_hints: ["en"],
  language_hints_strict: true,
  enable_speaker_diarization: true,
  enable_endpoint_detection: true,
  context: {
    general: [
      { key: "domain", value: "Restaurant" },
      { key: "setting", value: "Dine-in service" },
      { key: "topic", value: "Food and drink ordering" },
    ],
  },
};

/**
 * Map Soniox speaker id to UI format (S1 = waiter, S2 = customer, etc.)
 */
function toSpeakerLabel(speaker) {
  if (speaker == null || speaker === "") return "S1";
  const n = String(speaker).replace(/\D/g, "") || "1";
  return `S${n}`;
}

/** Soniox sends literal "<end>" for endpoint detection; do not show in transcript. */
function isEndToken(t) {
  const text = (t.text || "").trim();
  return text === "<end>" || text.toLowerCase() === "<end>";
}

function tokensToResults(tokens) {
  if (!tokens || tokens.length === 0) return [];

  // Group tokens by speaker, concatenate text directly (tokens already include spacing)
  const groups = [];
  for (const t of tokens) {
    if (isEndToken(t)) continue;
    const speaker = toSpeakerLabel(t.speaker);
    const last = groups[groups.length - 1];
    if (last && last.speaker === speaker) {
      last.text += t.text || ""; // Direct concatenation — NO extra space
    } else {
      groups.push({ speaker, text: t.text || "" });
    }
  }

  return groups.map((g) => ({
    alternatives: [{ content: g.text.trim(), speaker: g.speaker }],
  }));
}

/**
 * Send partial (provisional) tokens as PartialTranscript (lighter text) and
 * final tokens as AddTranscript (darker text), like Soniox compare UI.
 */
function sendTokenMessages(clientWs, tokens) {
  if (!tokens || tokens.length === 0 || clientWs.readyState !== clientWs.OPEN) return;
  const partialTokens = tokens.filter((t) => t.is_final === false);
  const finalTokens = tokens.filter((t) => t.is_final === true);
  console.log(finalTokens, "is_final");

  if (partialTokens.length > 0) {
    clientWs.send(
      JSON.stringify({ message: "PartialTranscript", results: tokensToResults(partialTokens) })
    );
  }
  if (finalTokens.length > 0) {
    clientWs.send(
      JSON.stringify({ message: "AddTranscript", results: tokensToResults(finalTokens) })
    );
  }
}

/**
 * Create a Soniox real-time STT WebSocket. Sends config on open; forwards client
 * binary audio; converts Soniox token responses to AddTranscript for the client.
 *
 * @param {WebSocket} clientWs - Browser WebSocket
 * @param {object} [configOverrides] - Override default config (e.g. model, context)
 * @returns {WebSocket} The Soniox WebSocket (use to send PCM after config is sent)
 */
export function createSonioxSocket(clientWs, configOverrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  if (!config.api_key) {
    console.warn("[Soniox] SONIOX_API_KEY not set");
  }

  const sonioxWs = new WebSocket(SONIOX_WS_URL);

  sonioxWs.on("open", () => {
    const payload = JSON.stringify(config);
    sonioxWs.send(payload);
  });

  sonioxWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.error_code != null) {
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(
            JSON.stringify({
              message: "Error",
              reason: msg.error_message || `Soniox error ${msg.error_code}`,
              type: String(msg.error_code),
            })
          );
        }
        return;
      }
      if (msg.finished) {
        return;
      }
      sendTokenMessages(clientWs, msg.tokens);
    } catch (err) {
      console.error("[Soniox] Parse error:", err?.message);
    }
  });

  sonioxWs.on("close", (code, reason) => {
    console.log("[Soniox] Disconnected:", code, reason?.toString?.() || "");
  });

  sonioxWs.on("error", (err) => {
    console.error("[Soniox] Error:", err?.message);
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(
        JSON.stringify({ message: "Error", reason: err?.message || "Soniox connection error" })
      );
    }
  });

  return sonioxWs;
}
