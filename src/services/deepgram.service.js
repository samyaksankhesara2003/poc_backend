
import WebSocket from "ws";


function groupBySpeaker(words = []) {
    const result = [];
    let currentSpeaker = null;
    let currentWords = [];

    for (const word of words) {
        if (word.speaker !== currentSpeaker) {
            if (currentWords.length >= 2) { // 👈 important
                result.push({
                    speaker: currentSpeaker,
                    text: currentWords.map(w => w.word).join(" "),
                });
            }
            currentSpeaker = word.speaker;
            currentWords = [word];
        } else {
            currentWords.push(word);
        }
    }

    if (currentWords.length >= 2) {
        result.push({
            speaker: currentSpeaker,
            text: currentWords.map(w => w.word).join(" "),
        });
    }

    return result;
}

export function createDeepgramConnection(clientWs) {
    //   const deepgram = new WebSocket(
    //     "wss://api.deepgram.com/v1/listen?punctuate=true&diarize=true",
    //     {
    //       headers: {
    //         Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
    //       },
    //     }
    //   );
    // const deepgram = new WebSocket(
    //     "wss://api.deepgram.com/v1/listen" +
    //     "?model=nova-2" +
    //     "&language=en-US" +
    //     "&diarize=true" +
    //     "&smart_format=true" +
    //     "&punctuate=true" +
    //     // "&interim_results=false" +
    //     "&vad_events=true" +
    //     "&endpointing=300",
    //     {
    //         headers: {
    //             Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
    //         },
    //     }
    // );
    const deepgram = new WebSocket(
        "wss://api.deepgram.com/v1/listen" +
        "?model=nova-2" +
        "&language=en-US" +
        "&diarize=true" +
        "&multichannel=true" + // Force single channel processing
        "&smart_format=true" +
        "&punctuate=true" +
        "&interim_results=false" + // ✅ Disable interim for better accuracy
        "&vad_events=true" +
        "&endpointing=1000", // ✅ Longer silence detection
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

        // if (!data.is_final) return;

        const alternative = data.channel?.alternatives?.[0];
        if (!alternative || !alternative.transcript) return;

        const speakerSegments = groupBySpeaker(alternative.words || []);
        console.log(speakerSegments, "sasa");

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
