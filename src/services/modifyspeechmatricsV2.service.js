import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

export function createSpeechmaticsSocketModify(clientWs) {
    const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
        headers: {
            Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
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
                    language: "es",
                    diarization: "speaker",
                    operating_point: "enhanced",
                    max_delay_mode: "fixed",
                    max_delay: 10,
                    enable_partials: true,
                    enable_entities: true,
                    speaker_diarization_config: {
                        max_speakers: 5,
                        speaker_sensitivity: 0.8,
                    }
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
                console.log("🛑 Transcription finished");
            }
        } catch (err) {
            console.error("Speechmatics parse error:", err);
        }
    });

    smWs.on("close", () => {
        console.log("🔌 Speechmatics disconnected");
    });

    smWs.on("error", (err) => {
        console.error("Speechmatics error:", err);
    });

    return smWs;
}