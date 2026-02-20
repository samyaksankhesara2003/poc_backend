import { WebSocketServer } from "ws";
import { createConversationSpeechmaticsSocket } from "../services/conversationSpeechmatics.service.js";
import { matchAudioToWaiter } from "../services/conversationDiarization.service.js";

const CONVERSATION_PATH = "/conversation-waiter";

const CHUNK_DURATION_SEC = 5;
/** 16 kHz × 2 bytes = 32000 bytes per second */
const BYTES_PER_SEC = 16000 * 2;
const CHUNK_SIZE_BYTES = CHUNK_DURATION_SEC * BYTES_PER_SEC;

export function handleConversationWaiterConnection(server) {
  const wss = new WebSocketServer({ server, path: CONVERSATION_PATH });

  wss.on("connection", (clientWs) => {
    console.log("🌐 [ConversationWaiter] Browser connected");
    let smWs = null;
    let waiterId = null;
    let configReceived = false;

    let currentLabel = "customer";
    /** Last N decisions for majority vote – reduces flicker (e.g. one bad chunk won’t flip label). */
    const RECENT_DECISIONS_MAX = 5;
    const recentDecisions = [];

    let pcmAccumulator = Buffer.alloc(0);
    let processing = false;

    function majorityWaiter() {
      if (recentDecisions.length === 0) return false;
      const t = recentDecisions.filter(Boolean).length;
      return t > recentDecisions.length / 2;
    }

    async function processChunk(chunk) {
      processing = true;
      try {
        // Step 1: Pinecone
        const { isWaiter } = await matchAudioToWaiter(chunk, waiterId);
        recentDecisions.push(isWaiter);
        if (recentDecisions.length > RECENT_DECISIONS_MAX) {
          recentDecisions.shift();
        }
        currentLabel = majorityWaiter() ? "waiter" : "customer";
      } catch (err) {
        console.error("[ConversationWaiter] Pinecone diarization error:", err?.message);
      }

      // Step 2: forward same chunk to Speechmatics
      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(chunk);
      }
      processing = false;
    }

    function drainAccumulator() {
      while (pcmAccumulator.length >= CHUNK_SIZE_BYTES && !processing) {
        const chunk = pcmAccumulator.subarray(0, CHUNK_SIZE_BYTES);
        pcmAccumulator = pcmAccumulator.subarray(CHUNK_SIZE_BYTES);
        processChunk(Buffer.from(chunk));
      }
    }

    clientWs.on("message", (data) => {
      if (!configReceived) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "config" && msg.waiterId) {
            waiterId = msg.waiterId;
            configReceived = true;
            smWs = createConversationSpeechmaticsSocket(clientWs, () => currentLabel);
          }
        } catch (_) {}
        return;
      }

      // Accumulate raw PCM audio
      pcmAccumulator = Buffer.concat([pcmAccumulator, Buffer.from(data)]);
      drainAccumulator();
    });

    clientWs.on("close", () => {
      console.log("❌ [ConversationWaiter] Browser disconnected");
      if (pcmAccumulator.length > 0 && smWs && smWs.readyState === smWs.OPEN) { // send remain audio
        smWs.send(pcmAccumulator);
        pcmAccumulator = Buffer.alloc(0);
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
