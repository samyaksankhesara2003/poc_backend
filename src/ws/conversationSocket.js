import { WebSocketServer } from "ws";
import { createConversationSpeechmaticsSocket } from "../services/conversationSpeechmatics.service.js";

const CONVERSATION_PATH = "/conversation-waiter";

/**
 * WebSocket server for waiter + customer conversation with Pinecone-based diarization.
 * Protocol: client connects, then sends first message as JSON: { type: "config", waiterId: "..." }.
 * Then client sends raw PCM audio. Server forwards to Speechmatics and sends back
 * LabeledTranscript (waiter/customer) using Pinecone matching.
 * Connect at: ws://<host>:<port>/conversation-waiter
 */
export function handleConversationWaiterConnection(server) {
  const wss = new WebSocketServer({ server, path: CONVERSATION_PATH });

  wss.on("connection", (clientWs) => {
    console.log("🌐 [ConversationWaiter] Browser connected");
    let smWs = null;
    let waiterId = null;
    const audioBuffer = [];
    let configReceived = false;

    clientWs.on("message", (data) => {
      if (!configReceived) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "config" && msg.waiterId) {
            waiterId = msg.waiterId;
            configReceived = true;
            smWs = createConversationSpeechmaticsSocket(clientWs, waiterId);
            smWs.on("open", () => {
              for (const chunk of audioBuffer) {
                if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
              }
              audioBuffer.length = 0;
            });
          }
        } catch (_) {
          // not JSON or invalid – ignore until config
        }
        return;
      }

      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(data);
      } else {
        audioBuffer.push(data);
      }
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
