import {realtimeService} from "../services/realtime.service.js";

export const registerSocketHandlers = (socket) => {

    socket.on("audio-complete", async (arrayBuffer) => {
      try {
        console.log(`Received complete audio: ${arrayBuffer.byteLength} bytes`);
        
        const text = await realtimeService.transcribeChunk(arrayBuffer);
        if (text) {
          console.log('Transcription:', text);
          socket.emit("realtime-text", text);
        } else {
          socket.emit("realtime-text", "[No speech detected]");
        }
      } catch (err) {
        console.error("Transcription error:", err.message);
        socket.emit("realtime-text", "[Transcription Error]");
      }
    });
  
    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  };
