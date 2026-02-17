import { WebSocketServer } from "ws";
import { createSessionSpeechmaticsSocket } from "../services/modifySessionSpeechmatics.service.js";

const SESSION_BACKEND_PATH = "/session-backend";

/**
 * WebSocket server for session-wise transcription via backend.
 * Client sends raw PCM audio; server forwards to Speechmatics and sends AddTranscript back.
 * Connect at: ws://<host>:<port>/session-backend
 */
export function handleSessionBackendConnection(server) {
  const wss = new WebSocketServer({ server, path: SESSION_BACKEND_PATH });

  wss.on("connection", (clientWs) => {
    console.log("🌐 [SessionBackend] Browser connected");

    const smWs = createSessionSpeechmaticsSocket(clientWs);
    const audioBuffer = [];
    let smReady = false;

    smWs.on("open", () => {
      smReady = true;
      for (const chunk of audioBuffer) {
        if (smWs.readyState === smWs.OPEN) smWs.send(chunk);
      }
      audioBuffer.length = 0;
    });

    clientWs.on("message", (audioChunk) => {
      if (smReady && smWs.readyState === smWs.OPEN) {
        smWs.send(audioChunk);
      } else {
        audioBuffer.push(audioChunk);
      }
    });

    clientWs.on("close", () => {
      console.log("❌ [SessionBackend] Browser disconnected");
      if (smWs.readyState === smWs.OPEN) {
        smWs.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
      }
      smWs.close();
    });

    clientWs.on("error", (err) => {
      console.error("[SessionBackend] Client error:", err);
    });
  });
}
