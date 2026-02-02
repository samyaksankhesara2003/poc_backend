// import WebSocket from "ws";

// export function createDeepgramConnection(clientWs) {
//     const deepgram = new WebSocket(
//         "wss://api.deepgram.com/v1/listen?punctuate=true&diarize=true&interim_results=true",
//         {
//             headers: {
//                 Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
//             },
//         }
//     );

//     deepgram.on("open", () => {
//         console.log("🧠 Deepgram connected");
//     });

//     deepgram.on("message", (msg) => {
//         const data = JSON.parse(msg.toString());

//         const transcript =
//             data.channel?.alternatives?.[0]?.transcript;

//         if (!transcript) return;

//         clientWs.send(
//             JSON.stringify({
//                 type: "transcript",
//                 text: transcript,
//                 isFinal: data.is_final || false,
//                 speakers: data.channel?.alternatives?.[0]?.words || [],
//             })
//         );
//     });

//     deepgram.on("close", () => {
//         console.log("❌ Deepgram disconnected");
//     });

//     deepgram.on("error", (err) => {
//         console.error("Deepgram error:", err);
//     });

//     return deepgram;
// }
import WebSocket from "ws";

function groupBySpeaker(words = []) {
  const result = [];
  let currentSpeaker = null;
  let currentText = [];

  for (const word of words) {
    if (word.speaker !== currentSpeaker) {
      if (currentText.length > 0) {
        result.push({
          speaker: currentSpeaker,
          text: currentText.join(" "),
        });
      }
      currentSpeaker = word.speaker;
      currentText = [word.word];
    } else {
      currentText.push(word.word);
    }
  }

  if (currentText.length > 0) {
    result.push({
      speaker: currentSpeaker,
      text: currentText.join(" "),
    });
  }

  return result;
}

export function createDeepgramConnection(clientWs) {
  const deepgram = new WebSocket(
    "wss://api.deepgram.com/v1/listen?punctuate=true&diarize=true",
    // "wss://api.deepgram.com/v1/listen?punctuate=true&diarize=true",
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

    const alternative = data.channel?.alternatives?.[0];
    if (!alternative || !alternative.transcript) return;

    const speakerSegments = groupBySpeaker(alternative.words || []);
console.log(speakerSegments,"sasa");

    clientWs.send(
      JSON.stringify({
        type: "transcript",
        isFinal: data.is_final || false,
        transcript: alternative.transcript,
        speakers: speakerSegments, // ✅ speaker:0, speaker:1 format
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
