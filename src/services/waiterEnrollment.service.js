import fs from "fs";
import path from "path";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { getEmbeddingFromFile } from "./speakerEmbedding.service.js";

dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX || "waiter";
const index = pinecone.index({ name: indexName });

const AUDIO_DIR = path.join(process.cwd(), "audio");

/**
 * Save raw audio buffer to disk.
 * @param {Buffer} buffer
 * @param {string} [originalName]
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
 * Store waiter voice vector in Pinecone.
 * @param {number[]} embedding
 * @param {object} metadata
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

export async function enrollWaiterVoice(audioBuffer, sessionId = null, originalName = "waiter.webm") {
  try {
    // console.log(sessionId,"sessionId>>>>>>>>>>>>>>");
    
    const { path: filePath, filename } = saveWaiterAudio(audioBuffer, originalName);

    // console.log("[waiterEnrollment] Extracting speaker embedding from audio…");
    const embedding = await getEmbeddingFromFile(filePath);
    // console.log("[waiterEnrollment] Embedding extracted, dimension:", embedding.length);

    const waiterId = `waiter-${sessionId || "session"}-${Date.now()}`;
    await storeWaiterVectorInPinecone(embedding, {
      sessionId: sessionId || waiterId,
      waiterId,
      createdAt: new Date().toISOString(),
      audioFilename: filename,
    });

    return {
      success: true,
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
