import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { initAudioSocket } from "./ws/audio.socket.js";
import { initDynamicAudioSocket } from "./ws/dynamicAudio.socket.js";
import { handleSpeechMatrixConnection } from "./ws/speechMatrix.js";
import { initPythonSocket } from "./ws/python.socket.js";
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// initAudioSocket(server);
// initDynamicAudioSocket(server);
handleSpeechMatrixConnection(server);

// initPythonSocket(server);
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
