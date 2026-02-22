# Tone service – emotion model

**Current implementation:** The tone service uses **`@huggingface/transformers`** with the **audio-classification** pipeline and model **`onnx-community/Speech-Emotion-Classification-ONNX`**. No local `.onnx` files are required; the model is loaded from the Hugging Face Hub on first use.

You can keep this folder for optional local models in the future. The rest of this README describes how to use a **local** ONNX file if you switch back.

---

## 1. Emotion model (Speech Emotion Recognition) – local ONNX (optional)

**What you need:** One ONNX file that takes **raw waveform** (float32, mono) and outputs **logits** for emotion classes.

### Option A – Recommended: HuggingFace (quantized, ~95 MB)

1. Open:  
   **https://huggingface.co/onnx-community/Speech-Emotion-Classification-ONNX/tree/main**
2. Go into the **`onnx`** folder.
3. Download **`model_quantized.onnx`** (or the non-quantized `model.onnx` if you prefer).
4. Save it in this folder as:  
   **`emotion.onnx`**

Direct download link (quantized):  
https://huggingface.co/onnx-community/Speech-Emotion-Classification-ONNX/resolve/main/onnx/model_quantized.onnx?download=true  

From this directory (`poc_backend/models/`), you can run:

```bash
curl -L -o emotion.onnx "https://huggingface.co/onnx-community/Speech-Emotion-Classification-ONNX/resolve/main/onnx/model_quantized.onnx?download=true"
```

- **Input:** float32 waveform. Our backend uses 16 kHz mono; shape `[1, 1, nSamples]` or `[1, nSamples]` (both are tried).
- **Output:** logits `[1, num_classes]`. We map argmax to:  
  `neutral`, `calm`, `happy`, `sad`, `angry`, `fearful`, `disgust`, `surprised`  
  (adjust `EMOTION_LABELS` in `tone.service.js` if your model uses a different order.)

If the model expects a different sample rate or mel-spectrogram, you’ll need to add a preprocessing step in `tone.service.js` (e.g. resample or compute mel features before creating the tensor).

### Option B – Other SER ONNX

Search HuggingFace for **“speech emotion recognition onnx”** or **“wav2vec2 emotion onnx”**.  
Download the ONNX file and save it as **`emotion.onnx`** here. Ensure input is raw waveform (or adapt our code to produce the expected features).

---

## 2. Sentiment model (optional)

**Recommendation:** For real-time waiter/customer tone, you can **skip** a sentiment ONNX and rely on:

- **OpenAI** (if `OPENAI_API_KEY` is in `.env`) for good text sentiment, or  
- **Keyword fallback** (no API, no ONNX).

That keeps latency and CPU lower. If you still want a sentiment ONNX:

### Option A – Use OpenAI / keywords (no ONNX)

Do nothing. Don’t add `sentiment.onnx`. The service will use:

- OpenAI for sentiment when `OPENAI_API_KEY` is set.
- Keyword-based sentiment otherwise.

### Option B – BERT/DistilBERT sentiment ONNX

Our code currently uses a **simple hash tokenizer** and shape `[1, 128]` for `input_ids`.  
Standard BERT/DistilBERT ONNX models expect **real tokenizer output** (their vocab). So to use them you would:

1. Download a sentiment ONNX from HuggingFace, e.g.:  
   - **Xenova/twitter-roberta-base-sentiment-latest**  
   - **Xenova/bert-base-multilingual-uncased-sentiment**
2. Integrate the **same tokenizer** as the model (e.g. WordPiece vocab + tokenizer in Node).
3. In `tone.service.js`, replace the simple tokenizer with that tokenizer and pass the correct `input_ids` (and `attention_mask` if the model needs it).

Until then, keeping **no** `sentiment.onnx` and using OpenAI/keywords is the supported, production-friendly setup.

---

## 3. Env (optional)

In `.env` you can override paths:

```env
EMOTION_ONNX_PATH=./models/emotion.onnx
SENTIMENT_ONNX_PATH=./models/sentiment.onnx
```

If unset, defaults are `models/emotion.onnx` and `models/sentiment.onnx` under the project root.

---

## 4. Final layout

Target layout:

```text
poc_backend/
  models/
    emotion.onnx   ← from Step 1 (e.g. model_quantized.onnx renamed)
    sentiment.onnx ← optional; leave absent to use OpenAI/keywords
    README.md      ← this file
```

After adding `emotion.onnx`, restart the backend. The first time the tone pipeline runs, it will load the model and log: `[tone] Emotion ONNX loaded: ...`.
