import { WebSocketServer } from "ws";
import {
  createConversationSpeechmaticsSocket,
  AudioTracker,
} from "../services/conversationSpeechmatics.service.js";
import { matchAudioToWaiter } from "../services/conversationDiarization.service.js";

const CONVERSATION_PATH = "/conversation-waiter";

/** Run Pinecone diarization every N ms (continuous check). */
const DIARIZATION_INTERVAL_MS = 1500;
/** Use last N seconds of audio for each continuous diarization check. */
const DIARIZATION_WINDOW_SEC = 2;

/**
 * WebSocket server for waiter + customer conversation with Pinecone-based diarization.
 *
 * Protocol:
 *   1. Client connects, sends JSON: { type: "config", waiterId: "..." }
 *   2. Client streams raw PCM audio (16 kHz, 16-bit, mono).
 *   3. Server forwards audio to Speechmatics AND keeps a local AudioTracker.
 *   4. When Speechmatics identifies speakers, the server extracts the speaker's
 *      audio from the tracker, builds a voice embedding, and queries Pinecone
 *      to decide waiter vs customer.
 *   5. LabeledTranscript messages are sent back to the client.
 *
 * Connect at: ws://<host>:<port>/conversation-waiter
 */
export function handleConversationWaiterConnection(server) {
  const wss = new WebSocketServer({ server, path: CONVERSATION_PATH });

  wss.on("connection", (clientWs) => {
    console.log("🌐 [ConversationWaiter] Browser connected");
    let smWs = null;
    let waiterId = null;
    const pendingAudio = [];
    let configReceived = false;
    const audioTracker = new AudioTracker();
    let diarizationIntervalId = null;
    /** Rolling log of continuous diarization: { timeSec, isWaiter, score }. Used to label transcript segments in UI. */
    const recentDiarization = [];
    const DIARIZATION_HISTORY_SEC = 60;

    /** Get speaker label at a given time (from continuous diarization). Used so UI labels match the isWaiter logs. */
    function getSpeakerAtTime(timeSec) {
      if (recentDiarization.length === 0) return null;
      let best = null;
      for (const entry of recentDiarization) {
        if (entry.timeSec <= timeSec) best = entry;
        else break;
      }
      return best ?? recentDiarization[0];
    }

    clientWs.on("message", (data) => {
      if (!configReceived) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "config" && msg.waiterId) {
            waiterId = msg.waiterId;
            configReceived = true;
            smWs = createConversationSpeechmaticsSocket(
              clientWs,
              waiterId,
              audioTracker,
              getSpeakerAtTime
            );
            smWs.on("open", () => {
              for (const chunk of pendingAudio) {
                if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
                audioTracker.addChunk(chunk);
              }
              pendingAudio.length = 0;
            });
            // Continuous diarization: run Pinecone on a fixed interval; store result by time so transcript labels match
            diarizationIntervalId = setInterval(async () => {
              const duration = audioTracker.durationSec;
              if (duration < DIARIZATION_WINDOW_SEC || !waiterId) return;
              try {
                const pcmBuffer = audioTracker.extractSegment({
                  start: Math.max(0, duration - DIARIZATION_WINDOW_SEC),
                  end: duration,
                });
                if (pcmBuffer.length > 0) {
                  const { isWaiter, score } = await matchAudioToWaiter(pcmBuffer, waiterId);
                  recentDiarization.push({ timeSec: duration, isWaiter, score });
                  while (
                    recentDiarization.length > 0 &&
                    recentDiarization[0].timeSec < duration - DIARIZATION_HISTORY_SEC
                  ) {
                    recentDiarization.shift();
                  }
                }
              } catch (err) {
                console.error("[ConversationWaiter] Continuous diarization error:", err?.message);
              }
            }, DIARIZATION_INTERVAL_MS);
          }
        } catch (_) {
          // not JSON / invalid – ignore until config
        }
        return;
      }

      // Feed audio to Speechmatics and the local audio tracker
      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(data);
      } else {
        pendingAudio.push(data);
      }
      audioTracker.addChunk(data);
    });

    clientWs.on("close", () => {
      console.log("❌ [ConversationWaiter] Browser disconnected");
      if (diarizationIntervalId != null) {
        clearInterval(diarizationIntervalId);
        diarizationIntervalId = null;
      }
      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
        smWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[ConversationWaiter] Client error:", err);
    });
  });
}
