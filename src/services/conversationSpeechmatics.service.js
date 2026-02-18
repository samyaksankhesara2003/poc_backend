import WebSocket from "ws";
import dotenv from "dotenv";
import { matchAudioToWaiter } from "./conversationDiarization.service.js";

dotenv.config();

function isPunctuationOnly(s) {
  return /^[.,!?;:'"\s]+$/.test((s || "").trim());
}

/** 16 kHz × 2 bytes (16-bit) = 32 000 bytes per second */
const BYTES_PER_SEC = 16000 * 2;

/** Min segment duration (sec) to run Pinecone; shorter segments default to "customer". */
const MIN_SEGMENT_AUDIO_SEC = 1;

/** Gap (sec) between words above which we start a new segment. */
const SEGMENT_GAP_SEC = 0.4;

/**
 * Tracks incoming PCM audio chunks so we can extract time-based segments
 * for custom Pinecone-based diarization.
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
   * Extract audio for a single time range [startSec, endSec].
   * @param {{ start: number, end: number }} timeRange - in seconds
   * @returns {Buffer}
   */
  extractSegment(timeRange) {
    return this.extractSegments([timeRange]);
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
 * Creates a Speechmatics real-time socket for transcription only.
 * Speaker labels (waiter/customer) come from the continuous diarization
 * (same isWaiter true/false as in logs): we look up getSpeakerAtTime(segmentTime).
 *
 * @param {WebSocket} clientWs   - Browser WebSocket
 * @param {string}    waiterId   - Waiter id from enrollment
 * @param {AudioTracker} audioTracker - Shared audio buffer
 * @param {(timeSec: number) => { isWaiter: boolean, score: number } | null} [getSpeakerAtTime] - from continuous diarization; if provided, labels use this instead of per-segment Pinecone
 */
export function createConversationSpeechmaticsSocket(
  clientWs,
  waiterId,
  audioTracker,
  getSpeakerAtTime
) {
  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
    },
  });

  smWs.on("open", () => {
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
          operating_point: "enhanced",
          max_delay_mode: "flexible",
          max_delay: 1,
          enable_partials: true,
          enable_entities: true,
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

        // Build segments from results (no Speechmatics speaker id).
        // Group by time gap: gap > SEGMENT_GAP_SEC => new segment.
        const segments = [];
        let current = null;

        for (const r of results) {
          const content = r.alternatives?.[0]?.content;
          const startTime = r.start_time;
          const endTime = r.end_time;
          if (content == null) continue;

          const gap =
            current != null && startTime != null ? startTime - current.endTime : SEGMENT_GAP_SEC + 1;

          if (
            current != null &&
            gap <= SEGMENT_GAP_SEC &&
            startTime != null &&
            endTime != null
          ) {
            current.text += isPunctuationOnly(content) ? content : (current.text ? " " : "") + content;
            current.endTime = endTime;
          } else {
            current = {
              startTime: startTime ?? current?.endTime ?? 0,
              endTime: endTime ?? startTime ?? 0,
              text: content,
            };
            segments.push(current);
          }
        }

        const labeled = [];
        for (const seg of segments) {
          let label = "customer";
          const midTime =
            seg.startTime != null && seg.endTime != null
              ? (seg.startTime + seg.endTime) / 2
              : seg.endTime ?? seg.startTime ?? 0;

          if (getSpeakerAtTime) {
            const entry = getSpeakerAtTime(midTime);
            if (entry) label = entry.isWaiter ? "waiter" : "customer";
          } else if (
            (seg.endTime ?? seg.startTime) - seg.startTime >= MIN_SEGMENT_AUDIO_SEC &&
            seg.startTime != null &&
            seg.endTime != null
          ) {
            try {
              const pcmBuffer = audioTracker.extractSegment({
                start: seg.startTime,
                end: seg.endTime,
              });
              if (pcmBuffer.length >= BYTES_PER_SEC * MIN_SEGMENT_AUDIO_SEC) {
                const { isWaiter } = await matchAudioToWaiter(pcmBuffer, waiterId);
                label = isWaiter ? "waiter" : "customer";
              }
            } catch (err) {
              console.error("[Conversation] Pinecone diarization error:", err?.message);
            }
          }

          labeled.push({ speaker: label, text: seg.text });
        }

        if (labeled.length > 0 && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "LabeledTranscript", results: labeled }));
        }
      }

      if (message.message === "EndOfTranscript") {
        // no-op
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

  smWs.on("close", () => {});

  smWs.on("error", (err) => {
    console.error("[Conversation] Speechmatics error:", err);
  });

  return smWs;
}
