import WebSocket from "ws";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const SM_WS_URL = "wss://eu2.rt.speechmatics.com/v2";
const SAMPLE_RATE = 16000;
const CHUNK_BYTES = 32000; // ~1 sec at 16kHz s16le

/**
 * Enroll a waiter using Speechmatics real-time API: run diarization with get_speakers
 * on the enrollment audio, then return speaker_identifiers for use in later sessions.
 *
 * @param {Buffer} pcmBuffer - Raw PCM 16-bit 16 kHz mono audio
 * @returns {Promise<{ speaker_identifiers: string[], label: string }>}
 */
export function enrollWaiterWithSpeechmatics(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.SPEECHMATICS_API_KEY;
    if (!apiKey) {
      reject(new Error("SPEECHMATICS_API_KEY is not set"));
      return;
    }

    const smWs = new WebSocket(SM_WS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let configSent = false;

    smWs.on("open", () => {
      smWs.send(
        JSON.stringify({
          message: "StartRecognition",
          audio_format: {
            type: "raw",
            encoding: "pcm_s16le",
            sample_rate: SAMPLE_RATE,
          },
          transcription_config: {
            language: "en",
            diarization: "speaker",
            operating_point: "enhanced",
            speaker_diarization_config: {
              get_speakers: true,
            },
          },
        })
      );
      configSent = true;

      // Stream PCM in chunks, then EndOfStream once
      let offset = 0;
      const sendChunk = () => {
        if (offset >= pcmBuffer.length) {
          smWs.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
          return;
        }
        const end = Math.min(offset + CHUNK_BYTES, pcmBuffer.length);
        smWs.send(pcmBuffer.subarray(offset, end));
        offset = end;
        setImmediate(sendChunk);
      };
      setImmediate(sendChunk);
    });

    smWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.message === "SpeakersResult" && msg.speakers?.length > 0) {
          const first = msg.speakers[0];
          const ids = first.speaker_identifiers || [];
          smWs.close();
          resolve({
            speaker_identifiers: ids,
            label: "Waiter",
          });
        }
        if (msg.message === "Error") {
          smWs.close();
          reject(new Error(msg.reason || msg.message || "Speechmatics enrollment error"));
        }
      } catch (_) {}
    });

    smWs.on("close", () => {
      if (!configSent) return;
      // If we closed without resolving, might be error or no SpeakersResult yet
    });

    smWs.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Convert audio file (webm, etc.) to PCM 16kHz mono and return buffer.
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Buffer>}
 */
export async function convertToPcm(filePath) {
  const pcmPath = filePath.replace(/\.[^.]+$/, "_enroll.pcm");
  try {
    await execAsync(
      `ffmpeg -y -i "${filePath}" -ar ${SAMPLE_RATE} -ac 1 -f s16le "${pcmPath}"`
    );
    return fs.readFileSync(pcmPath);
  } finally {
    if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
  }
}
