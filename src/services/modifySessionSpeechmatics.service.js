import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

/**
 * Creates a Speechmatics real-time socket for session-based transcription.
 * Forwards client audio to Speechmatics and sends AddTranscript (and related) messages back to the client.
 */
export function createSessionSpeechmaticsSocket(clientWs) {
  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
    },
  });

  smWs.on("open", () => {
    console.log("✅ [Session] Connected to Speechmatics");

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
          diarization: "speaker",
          operating_point: "enhanced",
          max_delay_mode: "flexible",
          max_delay: 1,
          enable_partials: true,
          enable_entities: true,
          speaker_diarization_config: {
            max_speakers: 10,
            prefer_current_speaker: true,
          },
        },
      })
    );
  });

  smWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.message === "AddTranscript") {
        clientWs.send(JSON.stringify(message));
      }

      if (message.message === "EndOfTranscript") {
        console.log("🛑 [Session] Transcription finished");
      }

      if (message.message === "Error") {
        const type = message.type || "unknown";
        const reason = message.reason || "";
        console.error("[Session] Speechmatics Error:", type, reason);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "Error", type, reason }));
        }
      }
    } catch (err) {
      console.error("[Session] Speechmatics parse error:", err);
    }
  });

  smWs.on("close", () => {
    console.log("🔌 [Session] Speechmatics disconnected");
  });

  smWs.on("error", (err) => {
    console.error("[Session] Speechmatics error:", err);
  });

  return smWs;
}
