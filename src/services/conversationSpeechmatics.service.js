import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

function isPunctuationOnly(s) {
  return /^[.,!?;:'"\s]+$/.test((s || "").trim());
}

const SEGMENT_GAP_SEC = 0.4;

export function createConversationSpeechmaticsSocket(clientWs, getCurrentLabel) {
  const smWs = new WebSocket("wss://eu2.rt.speechmatics.com/v2", {
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
    },
  });

  smWs.on("open", () => {
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
          operating_point: "enhanced",
          max_delay_mode: "flexible",
          max_delay: 6,
          enable_partials: true,
          enable_entities: true,
        },
      })
    );
  });

  smWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.message === "AddTranscript") {
        const results = message.results || [];
        if (results.length === 0) return;

        const segments = [];
        
        let current = null;

        for (const r of results) {
          const content = r.alternatives?.[0]?.content;
          const startTime = r.start_time;
          const endTime = r.end_time;
          if (content == null) continue;

          const gap =
            current != null && startTime != null
              ? startTime - current.endTime
              : SEGMENT_GAP_SEC + 1;

          if (
            current != null &&
            gap <= SEGMENT_GAP_SEC &&
            startTime != null &&
            endTime != null
          ) {
            current.text += isPunctuationOnly(content)
              ? content
              : (current.text ? " " : "") + content;
            current.endTime = endTime;
          } else {
            current = {
              startTime: startTime ?? current?.endTime ?? 0,
              endTime: endTime ?? startTime ?? 0,
              text: content,
            };
            segments.push(current);
          }
        }        
        const label = getCurrentLabel();
        const labeled = segments.map((seg) => ({
          speaker: label,
          text: seg.text,
        }));

        if (labeled.length > 0 && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(
            JSON.stringify({ message: "LabeledTranscript", results: labeled })
          );
        }
      }

      if (message.message === "Error") {
        const type = message.type || "unknown";
        const reason = message.reason || "";
        console.error("[Conversation] Speechmatics Error:", type, reason);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "Error", type, reason }));
        }
      }
    } catch (err) {
      console.error("[Conversation] Parse/process error:", err);
    }
  });

  smWs.on("close", () => {});

  smWs.on("error", (err) => {
    console.error("[Conversation] Speechmatics error:", err);
  });

  return smWs;
}
