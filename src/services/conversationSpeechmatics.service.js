import WebSocket from "ws";
import dotenv from "dotenv";
import { matchSegmentToWaiter } from "./conversationDiarization.service.js";

dotenv.config();

function isPunctuationOnly(s) {
  return /^[.,!?;:'"\s]+$/.test((s || "").trim());
}

/**
 * Creates a Speechmatics real-time socket that labels speakers as waiter/customer
 * by matching segment embeddings to the enrolled waiter in Pinecone.
 * Sends LabeledTranscript to client: { message: "LabeledTranscript", results: [ { speaker: "waiter"|"customer", text } ] }
 * @param {WebSocket} clientWs - Browser WebSocket
 * @param {string} waiterId - From enrollment (used to filter Pinecone)
 */
export function createConversationSpeechmaticsSocket(clientWs, waiterId) {
  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
    },
  });

  /** Cache: Speechmatics speaker id (S1, S2, ...) -> "waiter" | "customer" */
  const speakerLabelCache = new Map();

  async function resolveLabel(speakerId, text) {
    if (speakerLabelCache.has(speakerId)) {
      return speakerLabelCache.get(speakerId);
    }
    const trimmed = (text || "").trim();
    if (!trimmed || trimmed.length < 2) {
      console.log("[Conversation] Segment too short to match, defaulting to customer:", speakerId);
      return "customer";
    }
    const { isWaiter, score } = await matchSegmentToWaiter(trimmed, waiterId);
    const label = isWaiter ? "waiter" : "customer";
    speakerLabelCache.set(speakerId, label);
    console.log(
      "[Conversation] Speaker resolved:",
      JSON.stringify({
        speechmaticsSpeakerId: speakerId,
        label,
        score: score != null ? Math.round(score * 1000) / 1000 : null,
        segmentPreview: trimmed.slice(0, 50) + (trimmed.length > 50 ? "…" : ""),
      })
    );
    return label;
  }

  smWs.on("open", () => {
    console.log("✅ [Conversation] Connected to Speechmatics (waiter diarization)");
    smWs.send(
      JSON.stringify({
        message: "StartRecognition",
        audio_format: {
          type: "raw",
          encoding: "pcm_s16le",
          sample_rate: 16000,
        },
        transcription_config: {
          language: "en",
          diarization: "speaker",
          operating_point: "enhanced",
          max_delay_mode: "flexible",
          max_delay: 1,
          enable_partials: true,
          enable_entities: true,
          speaker_diarization_config: {
            max_speakers: 10,
            prefer_current_speaker: true,
          },
        },
      })
    );
  });

  smWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.message === "AddTranscript") {
        const results = message.results || [];
        if (results.length === 0) return;

        const segments = [];
        for (const r of results) {
          const content = r.alternatives?.[0]?.content;
          const speakerId = r.alternatives?.[0]?.speaker || "S1";
          if (content == null) continue;
          if (segments.length > 0 && segments[segments.length - 1].speakerId === speakerId) {
            const last = segments[segments.length - 1];
            last.text += isPunctuationOnly(content) ? content : (last.text ? " " : "") + content;
          } else {
            segments.push({ speakerId, text: content });
          }
        }

        const labeled = [];
        for (const seg of segments) {
          const label = await resolveLabel(seg.speakerId, seg.text);
          labeled.push({ speaker: label, text: seg.text });
        }

        if (labeled.length > 0 && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "LabeledTranscript", results: labeled }));
        }
      }

      if (message.message === "EndOfTranscript") {
        console.log("🛑 [Conversation] Transcription finished");
      }

      if (message.message === "Error") {
        const type = message.type || "unknown";
        const reason = message.reason || "";
        console.error("[Conversation] Speechmatics Error:", type, reason);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "Error", type, reason }));
        }
      }
    } catch (err) {
      console.error("[Conversation] Parse/process error:", err);
    }
  });

  smWs.on("close", () => {
    console.log("🔌 [Conversation] Speechmatics disconnected");
  });

  smWs.on("error", (err) => {
    console.error("[Conversation] Speechmatics error:", err);
  });

  return smWs;
}
