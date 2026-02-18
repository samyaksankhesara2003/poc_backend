import { WebSocketServer } from "ws";
import {
  createConversationSpeechmaticsSocket,
  AudioTracker,
} from "../services/conversationSpeechmatics.service.js";

const CONVERSATION_PATH = "/conversation-waiter";

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

    clientWs.on("message", (data) => {
      if (!configReceived) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "config" && msg.waiterId) {
            waiterId = msg.waiterId;
            configReceived = true;
            smWs = createConversationSpeechmaticsSocket(clientWs, waiterId, audioTracker);
            smWs.on("open", () => {
              for (const chunk of pendingAudio) {
                if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
                audioTracker.addChunk(chunk);
              }
              pendingAudio.length = 0;
            });
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
