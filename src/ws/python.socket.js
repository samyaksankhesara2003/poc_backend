import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

export function initPythonSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (clientWs) => {
    const sessionId = randomUUID();
    console.log("🌐 React connected:", sessionId);

    // ✅ Create a NEW Python connection for EACH client
    const pythonWs = new WebSocket("ws://localhost:8000");

    pythonWs.on("open", () => {
      console.log(`🐍 Python WS opened for session: ${sessionId}`);
    });

    pythonWs.on("error", (err) => {
      console.error(`❌ Python WS error for ${sessionId}:`, err.message);
    });

    // Forward messages from React to Python
    clientWs.on("message", (msg) => {
      let data;

      try {
        data = JSON.parse(msg.toString());
      } catch {
        console.error("❌ Invalid JSON from React");
        return;
      }

      // ✅ Inject sessionId
      const payload = {
        ...data,
        sessionId,
      };

      console.log(`📤 React → Python [${sessionId}]:`, data.type);

      // Wait for Python connection to be ready
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.send(JSON.stringify(payload));
      } else {
        console.error(`❌ Python WS not ready for ${sessionId}`);
      }
    });

    // Forward messages from Python to React
    pythonWs.on("message", (msg) => {
      const data = JSON.parse(msg.toString());
      console.log(`📥 Python → React [${sessionId}]:`, data.type);

      // Send back to correct client (should always match, but just in case)
      if (data.sessionId === sessionId) {
        clientWs.send(JSON.stringify(data));
      }
    });

    // Cleanup when React disconnects
    clientWs.on("close", () => {
      console.log(`❌ React disconnected: ${sessionId}`);
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.close();
      }
    });

    // Cleanup when Python disconnects
    pythonWs.on("close", () => {
      console.log(`❌ Python disconnected: ${sessionId}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });
  });

  console.log("🧠 Python bridge WS initialized");
}