import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { speechMatrixWss } from "./ws/speechmaticsV3.js";
import { saveAudioWss } from "./ws/saveAudioWs.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (pathname === "/save-audio") {
        saveAudioWss.handleUpgrade(req, socket, head, (ws) => {
            saveAudioWss.emit("connection", ws, req);
        });
    } else {
        // Default: Speechmatics session (matches any other path, e.g. /session-backend)
        speechMatrixWss.handleUpgrade(req, socket, head, (ws) => {
            speechMatrixWss.emit("connection", ws, req);
        });
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});