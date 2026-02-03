import { WebSocketServer } from "ws";
import { createDeepgramConnection } from "../services/deepgram.service.js";
import WebSocket from "ws";
import { createDeepConnection } from "../services/deep.service.js";

// export function initDynamicAudioSocket(server) {
//     const wss = new WebSocketServer({ server });

//     wss.on("connection", (client) => {
//         console.log("🎙️ Client connected");

//         let dgConnection = null;
//         let isPaused = false;

//         client.on("message", (message) => {
//             // 🔹 Control messages are strings
//             console.log(message,"message");

//             if (typeof message === "string") {
//                 const data = JSON.parse(message);

//                 if (data.type === "START") {
//                     console.log("▶️ Session started");
//                     dgConnection = createDeepConnection(client);
//                 }

//                 if (data.type === "PAUSE") {
//                     console.log("⏸ Session paused");
//                     isPaused = true;
//                 }

//                 if (data.type === "RESUME") {
//                     console.log("▶️ Session resumed");
//                     isPaused = false;
//                 }

//                 if (data.type === "STOP") {
//                     console.log("⏹ Session stopped");

//                     if (dgConnection?.readyState === WebSocket.OPEN) {
//                         dgConnection.close();
//                     }

//                     dgConnection = null;
//                     isPaused = false;
//                 }

//                 return;
//             }

//             // 🔹 Binary audio
//             if (
//                 dgConnection &&
//                 dgConnection.readyState === WebSocket.OPEN &&
//                 !isPaused
//             ) {
//                 dgConnection.send(message);
//             }
//         });

//         client.on("close", () => {
//             console.log("❌ Client disconnected");

//             if (dgConnection?.readyState === WebSocket.OPEN) {
//                 dgConnection.close();
//             }
//         });
//     });
// }
export function initDynamicAudioSocket(server) {
    const wss = new WebSocketServer({ server });

    wss.on("connection", (client) => {
        console.log("🎙️ Client connected");

        let dgConnection = null;
        let isPaused = false;

        client.on("message", (message) => {
            // 🔹 Try to parse control message
            
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch {
                data = null;
            }

            // 🔹 Handle control messages
            if (data?.type) {
                if (data.type === "START") {
                    console.log("▶️ Session started");
                    dgConnection = createDeepConnection(client);
                }

                if (data.type === "PAUSE") {
                    console.log("⏸ Session paused");
                    isPaused = true;
                }

                if (data.type === "RESUME") {
                    console.log("▶️ Session resumed");
                    isPaused = false;
                }

                if (data.type === "STOP") {
                    console.log("⏹ Session stopped");

                    if (dgConnection?.readyState === WebSocket.OPEN) {
                        dgConnection.close();
                    }

                    dgConnection = null;
                    isPaused = false;
                }

                return;
            }

            // 🔹 Binary audio chunks
            if (
                dgConnection &&
                dgConnection.readyState === WebSocket.OPEN &&
                !isPaused
            ) {
                dgConnection.send(message);
            }
        });

        client.on("close", () => {
            console.log("❌ Client disconnected");

            if (dgConnection?.readyState === WebSocket.OPEN) {
                dgConnection.close();
            }
        });
    });
}
