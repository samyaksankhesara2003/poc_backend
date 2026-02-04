
import WebSocket from "ws";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function reDiarizeUtterances(utterances) {
  const prompt = `
You are a real-time conversation role classifier.

Context: This is a restaurant conversation between a WAITER and a CUSTOMER.

Rules:
- Assign each sentence to exactly one role: waiter or customer
- Use conversational intent and flow
- Keep original order
- Output ONLY valid JSON

Input:
${utterances.map((u, i) => `${i + 1}. "${u.text}"`).join("\n")}

Output:
[
  { "role": "waiter|customer", "text": "..." }
]
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  return JSON.parse(res.choices[0].message.content);
}

export function aiConnection(clientWs) {
  const deepgram = new WebSocket(
    "wss://api.deepgram.com/v1/listen" +
      "?model=nova-2" +
      "&language=en-US" +
      "&diarize=true" +
      "&diarize_version=latest" +
      "&smart_format=true" +
      "&punctuate=true" +
      "&interim_results=true" +
      "&vad_events=true" +
      "&endpointing=500" +
      "&utterance_end_ms=1500" +
      "&encoding=linear16" +
      "&sample_rate=16000",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  let keepAliveInterval;
  let utteranceBuffer = [];
  let reDiarizeTimeout = null;
  let isProcessingAI = false; // Prevent concurrent AI calls

  deepgram.on("open", () => {
    console.log("🧠 Deepgram connected");
    
    keepAliveInterval = setInterval(() => {
      if (deepgram.readyState === WebSocket.OPEN) {
        deepgram.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 5000);
  });

  deepgram.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "Metadata") {
      console.log("📋 Deepgram metadata received");
      return;
    }

    // Send interim transcripts immediately
    if (!data.is_final) {
      const alternative = data.channel?.alternatives?.[0];
      if (alternative?.transcript) {
        clientWs.send(
          JSON.stringify({
            type: "interim_transcript",
            transcript: alternative.transcript,
          })
        );
      }
      return;
    }

    const alternative = data.channel?.alternatives?.[0];
    if (!alternative || !alternative.transcript) return;

    const speakerSegments = groupBySpeaker(alternative.words || []);
    
    if (speakerSegments.length === 0) return;

    // Send initial Deepgram diarization immediately
    clientWs.send(
      JSON.stringify({
        type: "transcript",
        isFinal: true,
        transcript: alternative.transcript,
        speakers: speakerSegments,
        source: "deepgram",
      })
    );

    // Add to buffer for AI re-diarization
    utteranceBuffer.push(...speakerSegments);

    // Clear existing timeout
    if (reDiarizeTimeout) {
      clearTimeout(reDiarizeTimeout);
    }

    // Schedule AI re-diarization after 2 seconds of silence
    reDiarizeTimeout = setTimeout(async () => {
      // Prevent processing if already running or buffer is empty
      if (isProcessingAI || utteranceBuffer.length === 0) return;

      isProcessingAI = true;
      const currentBuffer = [...utteranceBuffer]; // Copy buffer
      utteranceBuffer = []; // Clear buffer immediately

      try {
        console.log(`🤖 Running AI re-diarization on ${currentBuffer.length} utterances...`);
        const aiDiarized = await reDiarizeUtterances(currentBuffer);

        // Send AI-corrected diarization
        clientWs.send(
          JSON.stringify({
            type: "transcript_corrected",
            isFinal: true,
            speakers: aiDiarized,
            source: "ai",
          })
        );

        console.log(`✅ AI re-diarization sent: ${aiDiarized.length} segments`);
      } catch (error) {
        console.error("❌ AI re-diarization error:", error);
        // Return items to buffer on error (optional)
        // utteranceBuffer.unshift(...currentBuffer);
      } finally {
        isProcessingAI = false;
      }
    }, 2000);
  });

  deepgram.on("close", (code, reason) => {
    console.log(`❌ Deepgram disconnected: ${code} - ${reason}`);
    clearInterval(keepAliveInterval);
    if (reDiarizeTimeout) clearTimeout(reDiarizeTimeout);
  });

  deepgram.on("error", (err) => {
    console.error("Deepgram error:", err);
    clearInterval(keepAliveInterval);
    if (reDiarizeTimeout) clearTimeout(reDiarizeTimeout);
  });

  return deepgram;
}

function groupBySpeaker(words = []) {
  const result = [];
  let currentSpeaker = null;
  let currentWords = [];

  for (const word of words) {
    if (word.speaker !== currentSpeaker) {
      if (currentWords.length >= 3) {
        result.push({
          speaker: currentSpeaker,
          text: currentWords.map((w) => w.word).join(" "),
        });
      }
      currentSpeaker = word.speaker;
      currentWords = [word];
    } else {
      currentWords.push(word);
    }
  }

  if (currentWords.length >= 3) {
    result.push({
      speaker: currentSpeaker,
      text: currentWords.map((w) => w.word).join(" "),
    });
  }

  return result;
}