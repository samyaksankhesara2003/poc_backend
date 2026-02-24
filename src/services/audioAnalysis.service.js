/**
 * Bridge between the Node.js WebSocket pipeline and the Python audio
 * analysis microservice.  Manages a per-session WebSocket connection to
 * the Python FastAPI server, buffers incoming PCM chunks, and relays
 * analysis results back to a caller-supplied callback.
 */

import WebSocket from "ws";

const ANALYZER_URL =
  process.env.AUDIO_ANALYZER_URL || "ws://localhost:8100/ws/analyze";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class AudioAnalysisBridge {
  constructor(onAnalysis) {
    this._onAnalysis = onAnalysis;
    this._ws = null;
    this._connected = false;
    this._reconnectAttempts = 0;
    this._closed = false;
    this._pendingChunks = [];
  }

  connect() {
    if (this._closed) return;

    this._ws = new WebSocket(ANALYZER_URL);

    this._ws.on("open", () => {
      console.log("🔬 Connected to audio analyzer");
      this._connected = true;
      this._reconnectAttempts = 0;

      for (const chunk of this._pendingChunks) {
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(chunk);
        }
      }
      this._pendingChunks = [];
    });

    this._ws.on("message", (data) => {
      try {
        const result = JSON.parse(data.toString());
        this._onAnalysis(result);
      } catch (err) {
        console.error("Analyzer parse error:", err.message);
      }
    });

    this._ws.on("close", () => {
      this._connected = false;
      if (!this._closed) this._scheduleReconnect();
    });

    this._ws.on("error", (err) => {
      console.error("Analyzer WS error:", err.message);
      this._connected = false;
    });
  }

  sendAudio(pcmChunk) {
    if (this._closed) return;

    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(pcmChunk);
    } else {
      this._pendingChunks.push(Buffer.from(pcmChunk));
      if (this._pendingChunks.length > 500) {
        this._pendingChunks.splice(0, this._pendingChunks.length - 200);
      }
    }
  }

  close() {
    this._closed = true;
    this._pendingChunks = [];
    if (this._ws) {
      try {
        this._ws.close();
      } catch (_) {}
      this._ws = null;
    }
  }

  _scheduleReconnect() {
    if (this._closed) return;
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("🔬 Audio analyzer: max reconnect attempts reached");
      return;
    }
    this._reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * this._reconnectAttempts;
    setTimeout(() => this.connect(), delay);
  }
}
