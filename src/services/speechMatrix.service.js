import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();


export function createSpeechmaticsSocket(clientWs) {
  const SPEECHMATICS_TOKEN = process.env.SPEECHMATICS_API_KEY;

  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${SPEECHMATICS_TOKEN}`,
    },
  });

  smWs.on("open", () => {
    console.log("✅ Connected to Speechmatics");

    smWs.send(
      JSON.stringify({
        message: "StartRecognition",
        audio_format: {
          type: "raw",
          encoding: "pcm_s16le",
          sample_rate: 16000,
        },
        transcription_config: {
          language: "en",
          enable_partials: true,
          diarization: "speaker",
        },
      })
    );
  });

  smWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
        console.log(message,"message");
        
      if (
        message.message === "AddTranscript" 
        // ||
        // message.message === "AddPartialTranscript"
      ) {
        // Send transcript back to browser
        clientWs.send(JSON.stringify(message));
      }

      if (message.message === "EndOfTranscript") {
        console.log("🛑 Transcription finished");
      }

    } catch (err) {
      console.error("Speechmatics parse error:", err);
    }
  });

  smWs.on("error", (err) => {
    console.error("Speechmatics error:", err);
  });

  smWs.on("close", () => {
    console.log("🔌 Speechmatics disconnected");
  });

  return smWs;
}
