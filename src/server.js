// import http from "http";
// import app from "./app.js";
// import { initSocket } from "./socket/socket.server.js";
// const PORT = process.env.PORT || 3000;

// // const server = http.createServer(app);
// // initSocket(server);

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

import http from "http";
import app from "./app.js";
import { initSocket } from "./socket/socket.server.js";
import dotenv from "dotenv";
dotenv.config();


const PORT = process.env.PORT || 3000;

// ❗ create HTTP server
const server = http.createServer(app);

// ❗ attach socket.io
initSocket(server);

// ❗ listen using server, NOT app
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

