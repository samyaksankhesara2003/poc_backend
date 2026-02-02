import WebSocket from "ws";

export function createDeepgramConnection(clientWs) {
  const deepgram = new WebSocket(
    "wss://api.deepgram.com/v1/listen?punctuate=true&diarize=true&interim_results=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgram.on("open", () => {
    console.log("🧠 Deepgram connected");
  });

  deepgram.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (!transcript) return;

    clientWs.send(
      JSON.stringify({
        type: "transcript",
        text: transcript,
        isFinal: data.is_final || false,
        speakers: data.channel?.alternatives?.[0]?.words || [],
      })
    );
  });

  deepgram.on("close", () => {
    console.log("❌ Deepgram disconnected");
  });

  deepgram.on("error", (err) => {
    console.error("Deepgram error:", err);
  });

  return deepgram;
}
