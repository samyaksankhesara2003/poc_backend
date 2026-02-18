import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX || "waiter";
const index = pinecone.index({ name: indexName });

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = parseInt(process.env.PINECONE_INDEX_DIMENSION || "512", 10);

/** Minimum similarity score to label a segment as waiter (cosine). 1.0 = identical. */
const WAITER_MATCH_THRESHOLD = parseFloat(process.env.WAITER_MATCH_THRESHOLD || "0.6");

// Log threshold at startup so it's visible in backend logs
console.log(
  "[conversationDiarization] Waiter match threshold:",
  WAITER_MATCH_THRESHOLD,
  "(set WAITER_MATCH_THRESHOLD in .env to override). Declare as waiter when score >= threshold."
);

/**
 * Get embedding for text (same model/dimension as waiter enrollment).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed.slice(0, 8000),
    dimensions: EMBEDDING_DIMENSION,
  });
  return response.data[0].embedding;
}

/**
 * Match segment text to waiter by embedding + Pinecone query.
 * @param {string} segmentText - Text from one speaker segment
 * @param {string} waiterId - Waiter id from enrollment (used to filter Pinecone)
 * @returns {{ isWaiter: boolean, score: number }}
 */
export async function matchSegmentToWaiter(segmentText, waiterId) {
  console.log(segmentText,"segmentText>>>>>>>>>>>>>>");
  
  const embedding = await getEmbedding(segmentText);
  if (!embedding || !waiterId) {
    return { isWaiter: false, score: 0 };
  }
console.log(waiterId,"waiterId>>>>>>>>>>>>>>");

  try {
    const result = await index.query({
      vector: embedding,
      topK: 1,
      filter: { type: { $eq: "waiter" }, waiterId: { $eq: waiterId } },
      includeMetadata: true,
    });
console.log(result,"result>>>>>>>>>>>>>>");

    const match = result.matches?.[0];
    const score = match?.score ?? 0;
    const isWaiter = score >= WAITER_MATCH_THRESHOLD;
    const preview = (segmentText || "").slice(0, 60).replace(/\n/g, " ");
    console.log(
      "[conversationDiarization] Vector comparison:",
      JSON.stringify({
        segmentPreview: preview + (segmentText?.length > 60 ? "…" : ""),
        score: Math.round(score * 1000) / 1000,
        threshold: WAITER_MATCH_THRESHOLD,
        decision: isWaiter ? "waiter" : "customer",
        rule: `score >= ${WAITER_MATCH_THRESHOLD} => waiter`,
      })
    );
    return { isWaiter, score };
  } catch (err) {
    console.error("[conversationDiarization] Pinecone query error:", err?.message);
    return { isWaiter: false, score: 0 };
  }
}
