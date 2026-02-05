import WebSocket from "ws";

export function createDeepConnection(clientWs) {
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

    deepgram.on("open", () => {
        console.log("🧠 Deepgram connected");

        // ✅ Send keepalive to prevent timeout
        keepAliveInterval = setInterval(() => {
            if (deepgram.readyState === WebSocket.OPEN) {
                deepgram.send(JSON.stringify({ type: "KeepAlive" }));
            }
        }, 5000);
    });

    deepgram.on("message", (msg) => {
        const data = JSON.parse(msg.toString());

        // ✅ Handle metadata
        if (data.type === "Metadata") {
            console.log("📋 Deepgram metadata received");
            return;
        }

        // Only process final results for diarization
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

        clientWs.send(
            JSON.stringify({
                type: "transcript",
                isFinal: true,
                transcript: alternative.transcript,
                speakers: speakerSegments,
            })
        );
    });

    deepgram.on("close", (code, reason) => {
        console.log(`❌ Deepgram disconnected: ${code} - ${reason}`);
        clearInterval(keepAliveInterval);
    });

    deepgram.on("error", (err) => {
        console.error("Deepgram error:", err);
        clearInterval(keepAliveInterval);
    });

    return deepgram;
}

function groupBySpeaker(words = []) {
    const result = [];
    let currentSpeaker = null;
    let currentWords = [];

    for (const word of words) {
        if (word.speaker !== currentSpeaker) {
            if (currentWords.length >= 1) {
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

    if (currentWords.length >= 1) {
        result.push({
            speaker: currentSpeaker,
            text: currentWords.map(w => w.word).join(" "),
        });
    }

    return result;
}