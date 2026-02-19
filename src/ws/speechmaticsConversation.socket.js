import { WebSocketServer } from "ws";
import { createSpeechmaticsConversationSocket } from "../services/speechmaticsConversation.service.js";

const PATH = "/speechmatics-conversation";

/**
 * WebSocket server for Speechmatics-only real-time transcription with speaker identification.
 * Client must enroll first (POST /speechmatics-enroll) to get speaker_identifiers, then send
 * them in config. Speechmatics returns "Waiter" for the enrolled speaker and S1, S2 for others.
 *
 * Protocol:
 *   1. Client connects to ws://<host>:<port>/speechmatics-conversation
 *   2. Client sends JSON: { type: "config", speaker_identifiers: ["<id>", ...] }
 *   3. Client streams binary PCM (16 kHz, 16-bit, mono).
 *   4. Server forwards to Speechmatics and sends LabeledTranscript (waiter/customer) to client.
 */
export function handleSpeechmaticsConversationConnection(server) {
  const wss = new WebSocketServer({ server, path: PATH });

  wss.on("connection", (clientWs) => {
    console.log("🌐 [SpeechmaticsConversation] Client connected");
    let smWs = null;
    let configReceived = false;
    const pendingAudio = [];

    clientWs.on("message", (data) => {
      if (!configReceived) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "config") {
            configReceived = true;
            const speakerIdentifiers = msg.speaker_identifiers || [];
            try {
              smWs = createSpeechmaticsConversationSocket(clientWs, speakerIdentifiers);
              smWs.on("open", () => {
                for (const chunk of pendingAudio) {
                  if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
                }
                pendingAudio.length = 0;
              });
            } catch (err) {
              console.error("[SpeechmaticsConversation] Create error:", err?.message);
            }
          }
        } catch (_) {
          configReceived = true;
          pendingAudio.push(data);
          try {
            smWs = createSpeechmaticsConversationSocket(clientWs, []);
            smWs.on("open", () => {
              for (const chunk of pendingAudio) {
                if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
                pendingAudio.length = 0;
              }
            });
          } catch (e) {
            console.error("[SpeechmaticsConversation] Create error:", e?.message);
          }
        }
        return;
      }

      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(data);
      } else {
        pendingAudio.push(data);
      }
    });

    clientWs.on("close", () => {
      console.log("❌ [SpeechmaticsConversation] Client disconnected");
      if (smWs && smWs.readyState === smWs.OPEN) {
        smWs.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
        smWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[SpeechmaticsConversation] Client error:", err?.message);
    });
  });
}
