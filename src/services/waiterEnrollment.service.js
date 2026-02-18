import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX || "waiter";
const index = pinecone.index({ name: indexName });

const AUDIO_DIR = path.join(process.cwd(), "audio");
const EMBEDDING_MODEL = "text-embedding-3-small";
/** Must match your Pinecone index dimension (e.g. 512). */
const EMBEDDING_DIMENSION = parseInt(process.env.PINECONE_INDEX_DIMENSION || "512", 10);

/**
 * Ensure audio directory exists and save buffer to disk.
 * @param {Buffer} buffer - Raw audio file buffer
 * @param {string} [originalName] - e.g. "recording.webm"
 * @returns {{ path: string, filename: string }}
 */
export function saveWaiterAudio(buffer, originalName = "waiter-recording.webm") {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
  const ext = path.extname(originalName) || ".webm";
  const filename = `waiter-${Date.now()}${ext}`;
  const filePath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, filename };
}

/**
 * Transcribe audio file using OpenAI Whisper API.
 * @param {string} filePath - Absolute path to audio file
 * @returns {Promise<string>} - Transcript text
 */
export async function transcribeWithWhisper(filePath) {
  const readStream = fs.createReadStream(filePath);
  const transcription = await openai.audio.transcriptions.create({
    file: readStream,
    model: "whisper-1",
    language: "en",
  });
  return typeof transcription === "string" ? transcription : transcription.text;
}

/**
 * Get embedding vector for text using OpenAI.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSION,
  });
  return response.data[0].embedding;
}

/**
 * Store waiter voice vector in Pinecone.
 * @param {number[]} embedding
 * @param {object} metadata - e.g. { sessionId, transcript, createdAt }
 * @returns {Promise<void>}
 */
export async function storeWaiterVectorInPinecone(embedding, metadata) {
  const id = `waiter-${metadata.sessionId || Date.now()}-${Date.now()}`;
  await index.upsert({
    records: [
      {
        id,
        values: embedding,
        metadata: {
          type: "waiter",
          ...metadata,
        },
      },
    ],
  });
}

/**
 * Full flow: save audio → transcribe → embed → store in Pinecone.
 * @param {Buffer} audioBuffer
 * @param {string} [sessionId] - Optional session id for metadata
 * @param {string} [originalName] - Original filename from client
 * @returns {{ success: boolean, transcript?: string, waiterId?: string, error?: string }}
 */
export async function enrollWaiterVoice(audioBuffer, sessionId = null, originalName = "waiter.webm") {
  let savedPath = null;
  try {
    const { path: filePath, filename } = saveWaiterAudio(audioBuffer, originalName);
    savedPath = filePath;

    const transcript = await transcribeWithWhisper(filePath);
    if (!transcript || !transcript.trim()) {
      return { success: false, error: "No speech detected in the recording." };
    }

    const embedding = await getEmbedding(transcript);

    const waiterId = `waiter-${sessionId || "session"}-${Date.now()}`;
    await storeWaiterVectorInPinecone(embedding, {
      sessionId: sessionId || waiterId,
      waiterId,
      transcript: transcript.slice(0, 1000),
      createdAt: new Date().toISOString(),
      audioFilename: filename,
    });

    return {
      success: true,
      transcript: transcript.trim(),
      waiterId,
      filename,
    };
  } catch (err) {
    console.error("[waiterEnrollment]", err);
    return {
      success: false,
      error: err?.message || "Enrollment failed",
    };
  }
}
