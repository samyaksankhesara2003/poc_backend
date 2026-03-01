import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { sonioxWss } from "./ws/soniox.socket.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const SONIOX_PATH = "/session-soniox";

server.on("upgrade", (req, socket, head) => {
  const pathname = req.url?.split("?")[0] || "";
  if (pathname !== SONIOX_PATH) {
    socket.destroy();
    return;
  }
  sonioxWss.handleUpgrade(req, socket, head, (ws) => {
    sonioxWss.emit("connection", ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Backend (Soniox) running on port ${PORT}`);
});
