import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { getEmbeddingFromPCM } from "./speakerEmbedding.service.js";

dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX || "waiter";
const index = pinecone.index({ name: indexName });

/** Minimum cosine similarity to label a segment as waiter. */
const WAITER_MATCH_THRESHOLD = parseFloat(process.env.WAITER_MATCH_THRESHOLD || "0.87");

// console.log(
//   "[conversationDiarization] Waiter match threshold:",
//   WAITER_MATCH_THRESHOLD,
//   "(set WAITER_MATCH_THRESHOLD in .env to override). Declare as waiter when score >= threshold."
// );

/**
 * Match a PCM audio segment against the enrolled waiter voice in Pinecone.
 * @param {Buffer} pcmBuffer - Raw PCM 16-bit 16 kHz mono audio
 * @param {string} waiterId  - Waiter id from enrollment (Pinecone filter)
 * @returns {{ isWaiter: boolean, score: number }}
 */
export async function matchAudioToWaiter(pcmBuffer, waiterId) {
  if (!pcmBuffer || pcmBuffer.length === 0 || !waiterId) {
    console.log("[conversationDiarization] Skipped (no audio or waiterId)");
    return { isWaiter: false, score: 0 };
  }

  try {
    const embedding = await getEmbeddingFromPCM(pcmBuffer);

    const result = await index.query({
      vector: embedding,
      topK: 1,
      filter: { type: { $eq: "waiter" }, waiterId: { $eq: waiterId } },
      includeMetadata: true,
    });

    const match = result.matches?.[0];
    const score = match?.score ?? 0;
    const isWaiter = score >= WAITER_MATCH_THRESHOLD;

    console.log(
      "[conversationDiarization] Pinecone result:",
      JSON.stringify({
        matchId: match?.id ?? null,
        score: Math.round(score * 1000) / 1000,
        threshold: WAITER_MATCH_THRESHOLD,
        decision: isWaiter ? "waiter" : "customer",
        audioSec: Math.round((pcmBuffer.length / (16000 * 2)) * 10) / 10,
      })
    );

    return { isWaiter, score };
  } catch (err) {
    console.error("[conversationDiarization] Pinecone query error:", err?.message);
    return { isWaiter: false, score: 0 };
  }
}
