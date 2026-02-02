// import {WebSocketServer} from "ws";
// import { createDeepgramConnection } from "../services/deepgram.service.js";

// export function initAudioSocket(server) {
//   const wss = new WebSocketServer({ server });

//   wss.on("connection", (client) => {
//     console.log("🎙️ Client connected");

//     const dgConnection = createDeepgramConnection((result) => {
//       console.log("📝 Transcript:", result.text);

//       // Later:
//       // 👉 store in DB
//       // 👉 analyze tone
//       // 👉 send to frontend

//       client.send(JSON.stringify(result));
//     });

//     client.on("message", (audioChunk) => {
//       if (dgConnection.getReadyState() === 1) {
//         dgConnection.send(audioChunk);
//       }
//     });

//     client.on("close", () => {
//       console.log("Client disconnected");
//       dgConnection.close();
//     });
//   });
// }
import { WebSocketServer } from "ws";
import { createDeepgramConnection } from "../services/deepgram.service.js";
import WebSocket from "ws";

export function initAudioSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (client) => {
    console.log("🎙️ Client connected");

    const dgConnection = createDeepgramConnection(client);

    client.on("message", (audioChunk) => {
      if (
        dgConnection &&
        dgConnection.readyState === WebSocket.OPEN
      ) {
        dgConnection.send(audioChunk);
      }
    });

    client.on("close", () => {
      console.log("❌ Client disconnected");

      if (
        dgConnection &&
        dgConnection.readyState === WebSocket.OPEN
      ) {
        dgConnection.close();
      }
    });

    client.on("error", (err) => {
      console.error("Client WS error:", err);
    });
  });
}
