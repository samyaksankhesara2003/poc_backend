// import dotenv from "dotenv";
// dotenv.config();

// import http from "http";

// import { initAudioSocket } from "./ws/audio.socket.js";

// const server = http.createServer();

// initAudioSocket(server);

// server.listen(process.env.PORT, () => {
//   console.log(`🚀 Backend running on port ${process.env.PORT}`);
// });

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import { initAudioSocket } from "./ws/audio.socket.js";
import { initDynamicAudioSocket } from "./ws/dynamicAudio.socket.js";
const PORT = process.env.PORT || 3000;

// ✅ attach Express to HTTP server
const server = http.createServer(app);

// ✅ attach WebSocket to SAME server
initAudioSocket(server);
// initDynamicAudioSocket(server)
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});


//---------------------------------------------------------------working
// import http from "http";
// import app from "./app.js";
// import { initSocket } from "./socket/socket.server.js";
// import dotenv from "dotenv";
// dotenv.config();


// const PORT = process.env.PORT || 3000;

// // ❗ create HTTP server
// const server = http.createServer(app);

// // ❗ attach socket.io
// initSocket(server);

// // ❗ listen using server, NOT app
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

//---------------------------------------------------------------working