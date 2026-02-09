import { WebSocketServer } from "ws";
import { createSpeechmaticsSocket } from "../services/speechMatrix.service.js";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatrics.service.js";

export function handleSpeechMatrixConnectionSession(server) {
    const wss = new WebSocketServer({ server });

    wss.on("connection", (clientWs) => {
        console.log("🌐 Browser connected");

        // ✅ Pass the WebSocket object directly, not a callback
        // const smWs = createSpeechmaticsSocket(clientWs);
        const smWs = createSpeechmaticsSocketModify(clientWs);

        clientWs.on("message", (audioChunk) => {
            if (smWs.readyState === smWs.OPEN) {
                smWs.send(audioChunk);
            }
        });

        clientWs.on("close", () => {
            console.log("❌ Browser disconnected");

            if (smWs.readyState === smWs.OPEN) {
                smWs.send(JSON.stringify({ message: "EndOfStream" }));
            }
            smWs.close();
        });

        clientWs.on("error", (err) => {
            console.error("Client error:", err);
        });
    });
}