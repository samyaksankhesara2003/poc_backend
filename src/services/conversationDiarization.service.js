import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { getEmbeddingFromPCM } from "./speakerEmbedding.service.js";

dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX || "waiter";
const index = pinecone.index({ name: indexName });

const BYTES_PER_SEC = 16000 * 2;

/** Minimum similarity to label as waiter. Tune in .env (e.g. 0.72–0.82). */
const WAITER_MATCH_THRESHOLD = parseFloat(process.env.WAITER_MATCH_THRESHOLD || "0.75");
/** Waiter must beat best "other" match by this much (reduces false waiter). Tune in .env (e.g. 0.05–0.10). */
const WAITER_MIN_SCORE_GAP = parseFloat(process.env.WAITER_MIN_SCORE_GAP || "0.06");
/** Chunks shorter than this (seconds) are skipped – embeddings are noisier. */
const MIN_AUDIO_SEC = parseFloat(process.env.DIARIZATION_MIN_AUDIO_SEC || "1.5");

/**
 * Compare real-time audio to stored waiter voice(s) in Pinecone.
 * - Only considers chunks >= MIN_AUDIO_SEC for stability.
 * - Splits matches by waiterId: "this waiter" vs "others" (other sessions/voices).
 * - Requires both threshold and a score gap for higher accuracy.
 */
export async function matchAudioToWaiter(pcmBuffer, waiterId) {
  console.log(waiterId,"waiterId>>>>>>>>>>>>>>");
  
  if (!pcmBuffer || pcmBuffer.length === 0 || !waiterId) {
    return { isWaiter: false, score: 0 };
  }

  const audioSec = pcmBuffer.length / BYTES_PER_SEC;
  if (audioSec < MIN_AUDIO_SEC) {
    return { isWaiter: false, score: 0 };
  }

  try {
    const embedding = await getEmbeddingFromPCM(pcmBuffer);

    const result = await index.query({
      vector: embedding,
      topK: 10,
      filter: { type: { $eq: "waiter" } },
      includeMetadata: true,
    });

    const matches = result.matches || [];
    if (matches.length === 0) {
      return { isWaiter: false, score: 0 };
    }
    console.log(matches,"matches>>>>>>>>>>>>>>");
    

    // Split: this waiter (waiterId) vs other waiter vectors (other sessions/people)
    const thisScores = [];
    const otherScores = [];
    for (const m of matches) {
      const s = m.score ?? 0;
      if (m.metadata?.waiterId === waiterId) {
        thisScores.push(s);
      } else {
        otherScores.push(s);
      }
    }

    let waiterScore = thisScores.length > 0 ? Math.max(...thisScores) : 0;
    let bestOtherScore = otherScores.length > 0 ? Math.max(...otherScores) : 0;

    // If no vector has this waiterId (e.g. 5 samples each with different id), use best across ALL waiter vectors
    if (thisScores.length === 0 && matches.length > 0) {
      const allScores = matches.map((m) => m.score ?? 0);
      waiterScore = Math.max(...allScores);
      bestOtherScore = 0;
    }

    const scoreGap = waiterScore - bestOtherScore;

    // Require: above threshold AND (when we have "others") clearly better than others (gap)
    const isWaiter =
      waiterScore >= WAITER_MATCH_THRESHOLD && scoreGap >= WAITER_MIN_SCORE_GAP;

    // console.log("[conversationDiarization]", {
    //   waiterScore: waiterScore.toFixed(3),
    //   bestOtherScore: bestOtherScore.toFixed(3),
    //   gap: scoreGap.toFixed(3),
    //   threshold: WAITER_MATCH_THRESHOLD,
    //   minGap: WAITER_MIN_SCORE_GAP,
    //   decision: isWaiter ? "waiter" : "customer",
    //   audioSec: Math.round(audioSec * 10) / 10,
    // });

    return {
      isWaiter,
      score: Number(waiterScore.toFixed(3)),
      gap: Number(scoreGap.toFixed(3)),
    };
  } catch (err) {
    console.error("[conversationDiarization] Error:", err?.message);
    return { isWaiter: false, score: 0 };
  }
}
