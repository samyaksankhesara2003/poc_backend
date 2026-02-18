import { AutoProcessor, AutoModel } from "@xenova/transformers";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

const MODEL_NAME = "Xenova/wavlm-base-plus-sv";
const SAMPLE_RATE = 16000;

let processor = null;
let model = null;
let modelLoading = null;

/**
 * Lazy-load the speaker-embedding model (singleton).
 * First call downloads ~380 MB from Hugging Face; subsequent calls are instant.
 */
async function loadModel() {
  if (processor && model) return { processor, model };
  if (modelLoading) return modelLoading;

  modelLoading = (async () => {
    // console.log(`[SpeakerEmbedding] Loading ${MODEL_NAME} (first run downloads the model)…`);
    processor = await AutoProcessor.from_pretrained(MODEL_NAME);
    model = await AutoModel.from_pretrained(MODEL_NAME);
    // console.log("[SpeakerEmbedding] Model ready.");
    return { processor, model };
  })();

  return modelLoading;
}

/**
 * Convert signed 16-bit PCM buffer to Float32Array normalised to [-1, 1].
 */
export function pcm16ToFloat32(pcmBuffer) {
  const int16 = new Int16Array(
    pcmBuffer.buffer,
    pcmBuffer.byteOffset,
    pcmBuffer.byteLength / 2
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

/**
 * Extract speaker embedding from a Float32Array of 16 kHz mono audio samples.
 * @returns {Promise<number[]>} 512-dim embedding vector
 */
export async function getEmbeddingFromSamples(audioSamples) {
  const { processor, model } = await loadModel();
  const inputs = await processor(audioSamples);
  const { embeddings } = await model(inputs);
  return Array.from(embeddings.data);
}

/**
 * Extract speaker embedding from raw PCM 16-bit 16 kHz mono buffer.
 */
export async function getEmbeddingFromPCM(pcmBuffer) {
  return getEmbeddingFromSamples(pcm16ToFloat32(pcmBuffer));
}

/**
 * Extract speaker embedding from any audio file (webm, mp3, wav, etc.).
 * Uses ffmpeg to convert to raw 16 kHz mono PCM, then passes Float32Array
 * directly to the model (AudioContext is not available in Node.js).
 */
export async function getEmbeddingFromFile(filePath) {
  const pcmPath = filePath.replace(/\.[^.]+$/, "_speaker.pcm");

  try {
    await execAsync(
      `ffmpeg -y -i "${filePath}" -ar ${SAMPLE_RATE} -ac 1 -f s16le "${pcmPath}"`
    );
  } catch (err) {
    throw new Error(`Audio conversion failed (is ffmpeg installed?): ${err.message}`);
  }

  try {
    const rawPcm = fs.readFileSync(pcmPath);
    return getEmbeddingFromPCM(rawPcm);
  } finally {
    if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
  }
}

/** Pre-load model at server startup to avoid cold-start on first request. */
export async function warmup() {
  await loadModel();
}
