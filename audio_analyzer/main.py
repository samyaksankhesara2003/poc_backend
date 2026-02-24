"""
Real-time acoustic metrics microservice.

Accepts raw 16-bit PCM audio at 16 kHz over WebSocket, accumulates it
into sliding windows, extracts acoustic features (stress, confidence,
energy, pitch, speech rate), and streams structured metrics back.
Tone classification is handled by the LLM layer in Node.js.

Usage:
    uvicorn main:app --host 0.0.0.0 --port 8100 --workers 1
"""

import asyncio
import json
import time
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from analyzer import AudioAnalyzer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("audio_analyzer")

app = FastAPI(title="Audio Tone Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
WINDOW_SECONDS = 3.0
HOP_SECONDS = 2.0
WINDOW_BYTES = int(SAMPLE_RATE * WINDOW_SECONDS * BYTES_PER_SAMPLE)
HOP_BYTES = int(SAMPLE_RATE * HOP_SECONDS * BYTES_PER_SAMPLE)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "audio-tone-analyzer"}


@app.websocket("/ws/analyze")
async def analyze_audio(websocket: WebSocket):
    await websocket.accept()
    logger.info("Analysis client connected")

    analyzer = AudioAnalyzer(sample_rate=SAMPLE_RATE, window_seconds=WINDOW_SECONDS)
    buffer = bytearray()
    analysis_count = 0

    try:
        while True:
            data = await websocket.receive_bytes()
            buffer.extend(data)

            while len(buffer) >= WINDOW_BYTES:
                window = bytes(buffer[:WINDOW_BYTES])
                buffer = buffer[HOP_BYTES:]

                t0 = time.perf_counter()
                result = analyzer.analyze(window)
                elapsed_ms = (time.perf_counter() - t0) * 1000

                # Skip silence - handled by tone classifier as "silent_or_no_speech"
                if result.get("audio_metrics", {}).get("voice_quality") == "silence":
                    continue

                analysis_count += 1
                result["meta"] = {
                    "window_seconds": WINDOW_SECONDS,
                    "analysis_ms": round(elapsed_ms, 1),
                    "sequence": analysis_count,
                }

                await websocket.send_json(result)

                if analysis_count % 10 == 0:
                    logger.info(
                        "Analyses=%d  last_latency=%.1fms  buffer=%d bytes",
                        analysis_count, elapsed_ms, len(buffer),
                    )

    except WebSocketDisconnect:
        logger.info("Analysis client disconnected (analyses=%d)", analysis_count)
    except Exception as e:
        logger.error("Analysis error: %s", e, exc_info=True)
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100, log_level="info")
