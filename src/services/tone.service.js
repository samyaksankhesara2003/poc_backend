/**
 * Real-time tone from audio: local ONNX emotion model (models/emotion.onnx) via onnxruntime-node.
 * The Hub model used by @huggingface/transformers fails with "Protobuf parsing failed";
 * using the local .onnx file you downloaded works reliably.
 */

import path from "path";
import fs from "fs";

const EMOTION_LABELS = ["neutral", "calm", "happy", "sad", "angry", "fearful", "disgust", "surprised"];

let ort = null;
let emotionSession = null;

function resolveModelPath(envKey, defaultRelative) {
  const p = process.env[envKey] || defaultRelative;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function getOrt() {
  if (ort) return ort;
  try {
    ort = await import("onnxruntime-node");
    return ort;
  } catch (e) {
    console.warn("[tone] onnxruntime-node not available:", e.message);
    return null;
  }
}

function pcmToFloat32(pcmBuffer) {
  const len = Math.floor(pcmBuffer.length / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const s = pcmBuffer.readInt16LE(i * 2);
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return out;
}

async function getEmotionSession() {
  if (emotionSession) return emotionSession;
  const modelPath = resolveModelPath("EMOTION_ONNX_PATH", "models/emotion.onnx");
  if (!fs.existsSync(modelPath)) return null;
  const runtime = await getOrt();
  if (!runtime) return null;
  try {
    emotionSession = await runtime.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
    console.log("[tone] Emotion ONNX loaded:", modelPath);
    return emotionSession;
  } catch (e) {
    console.warn("[tone] Emotion model load failed:", e.message);
    return null;
  }
}

async function runEmotionOnAudio(pcmBuffer) {
  if (!pcmBuffer?.length) return "neutral";

  const session = await getEmotionSession();
  if (!session) return "neutral";

  const floats = pcmToFloat32(pcmBuffer);
  const o = await getOrt();
  if (!o) return "neutral";

  const shapes = [[1, 1, floats.length], [1, floats.length]];
  for (const dims of shapes) {
    try {
      const tensor = new o.Tensor("float32", floats, dims);
      const results = await session.run({ [session.inputNames[0]]: tensor });
      const data = results[session.outputNames[0]].data;
      
      const arr = Array.isArray(data) ? data : Array.from(data);
      let maxIdx = 0;
      for (let i = 1; i < arr.length; i++) {
        if (Number(arr[i]) > Number(arr[maxIdx])) maxIdx = i;
      }
      console.log(maxIdx,">>>>>>>>>>.");
      
      return EMOTION_LABELS[maxIdx] ?? "neutral";
    } catch (_) {
      continue;
    }
  }
  return "neutral";
}

export async function runTonePipeline(audioChunk, transcript) {
  console.log('run');
  
  const emotion = await runEmotionOnAudio(audioChunk);
  const tone = emotion;
  console.log(tone,">>>>>>>>>>.");
  
  return { emotion, textSentiment: "neutral", tone };
}

/** Optional: preload ONNX at startup so first request is fast. */
export async function initToneModels() {
  await getEmotionSession();
}

export const toneService = {
  runTonePipeline,
  runEmotionOnAudio,
  initToneModels,
};
