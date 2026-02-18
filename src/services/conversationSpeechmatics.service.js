import WebSocket from "ws";
import dotenv from "dotenv";
import { matchAudioToWaiter } from "./conversationDiarization.service.js";

dotenv.config();

function isPunctuationOnly(s) {
  return /^[.,!?;:'"\s]+$/.test((s || "").trim());
}

/** 16 kHz × 2 bytes (16-bit) = 32 000 bytes per second */
const BYTES_PER_SEC = 16000 * 2;

/** Minimum accumulated audio (seconds) before we attempt speaker identification. */
const MIN_SPEAKER_AUDIO_SEC = 2;

/**
 * Tracks incoming PCM audio chunks so we can later extract time-based segments
 * that correspond to a specific Speechmatics speaker.
 */
export class AudioTracker {
  constructor() {
    this.chunks = [];
    this.totalBytes = 0;
  }

  addChunk(chunk) {
    const buf = Buffer.from(chunk);
    this.chunks.push(buf);
    this.totalBytes += buf.length;
  }

  /**
   * Extract and concatenate audio for a list of time ranges (seconds).
   * @param {{ start: number, end: number }[]} timeRanges
   * @returns {Buffer}
   */
  extractSegments(timeRanges) {
    if (this.chunks.length === 0 || timeRanges.length === 0) return Buffer.alloc(0);

    const full = Buffer.concat(this.chunks);
    const parts = [];

    for (const { start, end } of timeRanges) {
      let s = Math.max(0, Math.floor(start * BYTES_PER_SEC));
      let e = Math.min(full.length, Math.ceil(end * BYTES_PER_SEC));
      s -= s % 2;
      if (e % 2) e = Math.min(e + 1, full.length);
      if (e > s) parts.push(full.slice(s, e));
    }

    return Buffer.concat(parts);
  }

  get durationSec() {
    return this.totalBytes / BYTES_PER_SEC;
  }
}

/**
 * Creates a Speechmatics real-time socket that labels speakers as waiter/customer
 * by matching speaker **audio embeddings** to the enrolled waiter in Pinecone.
 *
 * @param {WebSocket} clientWs   - Browser WebSocket
 * @param {string}    waiterId   - Waiter id from enrollment
 * @param {AudioTracker} audioTracker - Shared audio buffer
 */
export function createConversationSpeechmaticsSocket(clientWs, waiterId, audioTracker) {
  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
    },
  });

  /** Cache: Speechmatics speaker id (S1, S2, …) → "waiter" | "customer" */
  const speakerLabelCache = new Map();

  /** Per-speaker accumulated time ranges for audio extraction. */
  const speakerTimings = new Map();

  function addSpeakerTiming(speakerId, startTime, endTime) {
    if (!speakerTimings.has(speakerId)) {
      speakerTimings.set(speakerId, { ranges: [], total: 0 });
    }
    const info = speakerTimings.get(speakerId);
    info.ranges.push({ start: startTime, end: endTime });
    info.total += endTime - startTime;
  }

  async function resolveLabel(speakerId) {
    if (speakerLabelCache.has(speakerId)) {
      const label = speakerLabelCache.get(speakerId);
      console.log("[Conversation] Speaker", speakerId, "→", label, "(cached)");
      return label;
    }

    const info = speakerTimings.get(speakerId);
    if (!info || info.total < MIN_SPEAKER_AUDIO_SEC) {
      return "customer"; // tentative — not enough audio yet; NOT cached so we retry later
    }

    try {
      const pcmBuffer = audioTracker.extractSegments(info.ranges);
      if (pcmBuffer.length < BYTES_PER_SEC * 1) return "customer";

      const { isWaiter, score } = await matchAudioToWaiter(pcmBuffer, waiterId);
      const label = isWaiter ? "waiter" : "customer";
      speakerLabelCache.set(speakerId, label);

      // console.log(
      //   "[Conversation] Speaker resolved via audio embedding:",
      //   JSON.stringify({
      //     speechmaticsSpeakerId: speakerId,
      //     label,
      //     score: score != null ? Math.round(score * 1000) / 1000 : null,
      //     audioSec: Math.round(info.total * 10) / 10,
      //   })
      // );
      return label;
    } catch (err) {
      console.error("[Conversation] Speaker resolve error:", err?.message);
      return "customer";
    }
  }

  smWs.on("open", () => {
    // console.log("✅ [Conversation] Connected to Speechmatics (waiter diarization)");
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

        for (const r of results) {
          const speakerId = r.alternatives?.[0]?.speaker || "S1";
          if (r.start_time != null && r.end_time != null) {
            addSpeakerTiming(speakerId, r.start_time, r.end_time);
          }
        }

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
          const label = await resolveLabel(seg.speakerId);
          labeled.push({ speaker: label, text: seg.text });
        }

        if (labeled.length > 0 && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "LabeledTranscript", results: labeled }));
        }
      }

      if (message.message === "EndOfTranscript") {
        // console.log("🛑 [Conversation] Transcription finished");
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
    // console.log("🔌 [Conversation] Speechmatics disconnected");
  });

  smWs.on("error", (err) => {
    console.error("[Conversation] Speechmatics error:", err);
  });

  return smWs;
}
