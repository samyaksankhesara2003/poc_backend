import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";

import { handleSessionBackendConnection } from "./ws/modifySessionSocket.js";
import { handleConversationWaiterConnection } from "./ws/conversationSocket.js";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// handleSessionBackendConnection(server);
handleConversationWaiterConnection(server);
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});