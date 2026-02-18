import { pipeline } from "@xenova/transformers";

let classifier = null;

export async function getSentiment(text) {
  if (!classifier) {
    console.log("Loading sentiment model...");
    classifier = await pipeline(
      "sentiment-analysis",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
    );
  }

  const result = await classifier(text);

  return {
    label: result[0].label,       
    score: result[0].score,
  };
}
