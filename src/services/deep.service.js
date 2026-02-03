import WebSocket from "ws";

export function createDeepConnection(clientWs) {
    const deepgram = new WebSocket(
        "wss://api.deepgram.com/v1/listen" +
        "?model=nova-2" +
        "&language=en-US" +
        "&diarize=true" +
        "&diarize_version=latest" + // ✅ Use latest diarization
        "&smart_format=true" +
        "&punctuate=true" +
        "&interim_results=true" + // ✅ Enable interim results
        "&vad_events=true" +
        "&endpointing=500" + // ✅ Increased from 300ms
        "&utterance_end_ms=1500", // ✅ Wait longer before ending utterance
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
        
        // Only process final results for diarization
        if (!data.is_final) {
            // Still show interim transcript without speaker info
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

        // console.log("Final segments:", speakerSegments);

        clientWs.send(
            JSON.stringify({
                type: "transcript",
                isFinal: true,
                transcript: alternative.transcript,
                speakers: speakerSegments,
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

function groupBySpeaker(words = []) {
    const result = [];
    let currentSpeaker = null;
    let currentWords = [];

    for (const word of words) {
        if (word.speaker !== currentSpeaker) {
            if (currentWords.length >= 3) { // ✅ Increased from 2 to 3
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

    if (currentWords.length >= 3) {
        result.push({
            speaker: currentSpeaker,
            text: currentWords.map(w => w.word).join(" "),
        });
    }

    return result;
}