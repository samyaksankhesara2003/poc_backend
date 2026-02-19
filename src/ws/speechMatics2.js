import { WebSocketServer } from "ws";
import { createSpeechmaticsSocket } from "../services/speechMatrix.service.js";
import { createSpeechmaticsSocketModify } from "../services/modifyspeechmatrics.service.js";

// Changed: noServer:true so it doesn't bind to all upgrades automatically
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (clientWs) => {
    console.log("🌐 Browser connected");

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

// Export the wss instance so server.js can route upgrades to it
export { wss as speechMatrixWss };

// Keep original export name so nothing else breaks
export function handleSpeechMatrixConnection() {
    // intentionally empty — routing now handled in server.js
}