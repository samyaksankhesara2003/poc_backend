import WebSocket from "ws";

const SM_WS_URL = "wss://eu2.rt.speechmatics.com/v2";

function isPunctuationOnly(s) {
  return /^[.,!?;:'"\s]+$/.test((s || "").trim());
}

/**
 * Create Speechmatics real-time connection with speaker identification (known_speakers).
 * Uses only Speechmatics — no Pinecone. Transcripts have speaker "Waiter" or "S1", "S2", etc.
 *
 * @param {import("ws").WebSocket} clientWs - Client WebSocket
 * @param {string[]} speakerIdentifiers - From Speechmatics enrollment (get_speakers)
 */
export function createSpeechmaticsConversationSocket(clientWs, speakerIdentifiers) {
  console.log(speakerIdentifiers, "speakerIdentifiers>>>>>>>>>>>>>>");

  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(
        JSON.stringify({ message: "Error", reason: "SPEECHMATICS_API_KEY is not set" })
      );
    }
    throw new Error("SPEECHMATICS_API_KEY is not set");
  }

  const smWs = new WebSocket(SM_WS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
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
          diarization: "speaker",
          operating_point: "enhanced",
          // max_delay_mode: "flexible",
          max_delay_mode: "fixed",

          // max_delay: 1,
          max_delay: 10,

          enable_partials: true,
          enable_entities: true,
          speaker_diarization_config: {
            max_speakers: 10,
            speaker_sensitivity: 0.8,
            speakers:
              speakerIdentifiers?.length > 0
                ? [
                  {
                    label: "Waiter",
                    speaker_identifiers: speakerIdentifiers,
                  },
                ]
                : undefined,
          },
        },
      })
    );
  });

  smWs.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.message === "AddTranscript") {
        const results = message.results || [];
        if (results.length === 0) return;

        const segments = [];
        let current = null;
        const SEGMENT_GAP = 0.4;

        for (const r of results) {
          const content = r.alternatives?.[0]?.content;
          const speaker = r.alternatives?.[0]?.speaker ?? "S1";
          const startTime = r.start_time;
          const endTime = r.end_time;
          if (content == null) continue;

          const gap =
            current != null && startTime != null ? startTime - current.endTime : SEGMENT_GAP + 1;

          if (
            current != null &&
            gap <= SEGMENT_GAP &&
            startTime != null &&
            endTime != null &&
            current.speaker === speaker
          ) {
            current.text += isPunctuationOnly(content) ? content : (current.text ? " " : "") + content;
            current.endTime = endTime;
          } else {
            current = {
              startTime: startTime ?? current?.endTime ?? 0,
              endTime: endTime ?? startTime ?? 0,
              speaker: speaker,
              text: content,
            };
            segments.push(current);
          }
        }

        const labeled = segments.map((seg) => ({
          speaker: seg.speaker === "Waiter" ? "waiter" : "customer",
          text: seg.text,
        }));

        if (labeled.length > 0 && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(
            JSON.stringify({ message: "LabeledTranscript", results: labeled })
          );
        }
      }

      if (message.message === "Error") {
        const reason = message.reason || message.message || "Speechmatics error";
        console.error("[SpeechmaticsConversation] Error:", reason);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({ message: "Error", reason }));
        }
      }
    } catch (err) {
      console.error("[SpeechmaticsConversation] Parse error:", err?.message);
    }
  });

  smWs.on("close", () => { });
  smWs.on("error", (err) => {
    console.error("[SpeechmaticsConversation] WS error:", err?.message);
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(
        JSON.stringify({ message: "Error", reason: err?.message || "Connection error" })
      );
    }
  });

  return smWs;
}
