/**
 * Production-grade LLM-based tone classification per speaker turn.
 *
 * Updated with improved 10-category system:
 * - Better complaint granularity (neutral/polite/frustration/escalation)
 * - Explicit request detection (polite_request)
 * - Enhanced response format (intent, requires_action)
 * - Explicit silence handling
 *
 * Features:
 * - Clear, non-overlapping tone categories
 * - Audio + text feature mapping
 * - Business action mapping
 * - Optimized LLM prompt
 * - Retry logic with exponential backoff
 * - Timeout handling (5s)
 * - Rate limit handling (429 errors)
 * - Circuit breaker pattern
 * - Fallback to acoustic-only classification
 * - Safe JSON parsing
 * - Input validation
 * - Structured error logging
 */

import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 5000, // 5 second timeout
  maxRetries: 3,
});

/**
 * TONE CATEGORIES - Improved 10-Category System
 * 
 * Better complaint granularity, explicit request detection, enhanced actionability
 */
const TONE_CATEGORIES = {
  neutral_casual: {
    key: "neutral_casual",
    label: "Neutral / Casual",
    icon: "😐",
    definition: "Normal conversational tone, no strong emotion. Standard interaction, routine communication.",
    textPatterns: {
      neutral: {
        en: ["okay", "sure", "yes", "no", "maybe", "I'll have", "can I get"],
        es: ["vale", "claro", "sí", "no", "tal vez", "quiero", "puedo tener"]
      },
      routine: {
        en: ["order", "menu", "check", "bill", "table"],
        es: ["pedido", "menú", "cuenta", "mesa", "orden"]
      },
      filler: {
        en: ["um", "uh", "hmm", "well"],
        es: ["eh", "este", "pues", "bueno"]
      }
    },
    audioMapping: {
      stress_range: [0.2, 0.5],
      confidence_range: [0.4, 0.7],
      energy_range: [-52, -42],
      speech_rate_range: [100, 140]
    },
    businessAction: {
      priority: "normal",
      action: "Continue standard service flow",
      nextSteps: ["Process request normally", "Provide information", "Take order"]
    },
    intent: "informational",
    requires_action: false
  },

  positive_friendly: {
    key: "positive_friendly",
    label: "Positive / Friendly",
    icon: "😊",
    definition: "Warm, welcoming, appreciative, genuinely happy. Customer is satisfied and pleasant.",
    textPatterns: {
      positive: {
        en: ["thank you", "great", "wonderful", "amazing", "love it", "perfect", "excellent", "appreciate"],
        es: ["gracias", "genial", "maravilloso", "increíble", "me encanta", "perfecto", "excelente", "agradezco"]
      },
      greetings: {
        en: ["hello", "hi", "good evening", "nice to meet"],
        es: ["hola", "buenas tardes", "buenas noches", "encantado", "mucho gusto"]
      },
      politeness: {
        en: ["please", "thank", "appreciate"],
        es: ["por favor", "gracias", "agradezco"]
      }
    },
    audioMapping: {
      stress_range: [0.0, 0.4],
      confidence_range: [0.6, 1.0],
      energy_range: [-50, -35],
      speech_rate_range: [110, 150]
    },
    businessAction: {
      priority: "low",
      action: "Maintain service quality, acknowledge appreciation, build rapport",
      nextSteps: ["Thank customer", "Ask if they need anything else", "Continue standard service"]
    },
    intent: "appreciation",
    requires_action: false
  },

  polite_request: {
    key: "polite_request",
    label: "Polite Request",
    icon: "🙋",
    definition: "Politely asking for something (menu, order, information). Distinguished from casual chat by request intent.",
    textPatterns: {
      request: {
        en: ["could I", "may I", "can I", "I'd like", "I would like", "please bring", "could you bring"],
        es: ["podría", "puedo", "me gustaría", "quisiera", "por favor traiga", "podría traer", "me puede traer"]
      },
      polite: {
        en: ["please", "excuse me", "sorry", "if possible"],
        es: ["por favor", "disculpe", "perdón", "si es posible"]
      },
      ordering: {
        en: ["order", "have", "get", "bring", "menu", "check"],
        es: ["pedir", "tener", "traer", "menú", "cuenta", "orden"]
      }
    },
    audioMapping: {
      stress_range: [0.2, 0.5],
      confidence_range: [0.5, 0.8],
      energy_range: [-48, -40],
      speech_rate_range: [110, 145]
    },
    businessAction: {
      priority: "normal",
      action: "Fulfill request promptly, acknowledge politely",
      nextSteps: ["Acknowledge request", "Fulfill immediately", "Confirm understanding"]
    },
    intent: "requesting",
    requires_action: true
  },

  upsell_opportunity: {
    key: "upsell_opportunity",
    label: "Upsell Opportunity",
    icon: "🤩",
    definition: "Excited, enthusiastic, delighted customer. High satisfaction, perfect moment to suggest premium items or additional services.",
    textPatterns: {
      excitement: {
        en: ["amazing", "delicious", "best", "love", "fantastic", "incredible"],
        es: ["increíble", "delicioso", "mejor", "me encanta", "fantástico", "asombroso"]
      },
      satisfaction: {
        en: ["perfect", "exactly", "exactly what I wanted", "better than expected"],
        es: ["perfecto", "exactamente", "exactamente lo que quería", "mejor de lo esperado"]
      },
      enthusiasm: {
        en: ["wow", "oh my", "this is", "absolutely"],
        es: ["guau", "dios mío", "esto es", "absolutamente"]
      }
    },
    audioMapping: {
      stress_range: [0.1, 0.35],
      confidence_range: [0.75, 1.0],
      energy_range: [-42, -32],
      speech_rate_range: [135, 165]
    },
    businessAction: {
      priority: "low",
      action: "Suggest premium items, desserts, drinks, or additional services",
      nextSteps: ["Suggest premium menu items", "Offer dessert", "Recommend wine pairing", "Suggest appetizers", "Offer loyalty program"]
    },
    intent: "satisfaction",
    requires_action: true
  },

  neutral_complaint: {
    key: "neutral_complaint",
    label: "Neutral Complaint",
    icon: "😐",
    definition: "Factual statement of an issue without strong emotion. Customer is stating a problem matter-of-factly.",
    textPatterns: {
      factual: {
        en: ["this is", "the", "it's", "it is"],
        es: ["esto está", "el", "la", "está", "es"]
      },
      issue: {
        en: ["cold", "wrong", "not right", "incorrect", "missing"],
        es: ["frío", "fría", "incorrecto", "incorrecta", "equivocado", "falta", "no está bien"]
      },
      neutral: {
        en: ["is", "was", "are"],
        es: ["está", "era", "son", "es"]
      }
    },
    audioMapping: {
      stress_range: [0.4, 0.65],
      confidence_range: [0.4, 0.7],
      energy_range: [-50, -42],
      speech_rate_range: [105, 140]
    },
    businessAction: {
      priority: "high",
      action: "Acknowledge issue, fix promptly, confirm resolution",
      nextSteps: ["Acknowledge issue", "Fix immediately", "Confirm fix", "Check satisfaction"]
    },
    intent: "complaining",
    requires_action: true
  },

  polite_complaint: {
    key: "polite_complaint",
    label: "Polite Complaint",
    icon: "🙂",
    definition: "Polite but clearly raising an issue or concern. Customer is respectful but needs something fixed.",
    textPatterns: {
      polite: {
        en: ["excuse me", "sorry to bother", "I hate to say", "if possible", "could you"],
        es: ["disculpe", "perdón por molestar", "lamento decir", "si es posible", "podría", "podrías"]
      },
      issue: {
        en: ["cold", "wrong", "not quite", "a bit", "slightly"],
        es: ["frío", "fría", "incorrecto", "no está bien", "un poco", "ligeramente"]
      },
      respect: {
        en: ["please", "thank you", "appreciate"],
        es: ["por favor", "gracias", "agradezco"]
      }
    },
    audioMapping: {
      stress_range: [0.45, 0.7],
      confidence_range: [0.4, 0.7],
      energy_range: [-48, -38],
      speech_rate_range: [115, 145]
    },
    businessAction: {
      priority: "high",
      action: "Acknowledge politely, fix issue promptly, thank for patience",
      nextSteps: ["Acknowledge issue politely", "Fix immediately", "Thank for patience", "Check back", "Ensure satisfaction"]
    },
    intent: "complaining",
    requires_action: true
  },

  frustration_complaint: {
    key: "frustration_complaint",
    label: "Frustration / Complaint",
    icon: "😤",
    definition: "Clear frustration, annoyance, or complaint. Customer is upset but not aggressive. Issue needs immediate attention.",
    textPatterns: {
      complaint: {
        en: ["not what I ordered", "wrong", "this is not", "I asked for", "this isn't right"],
        es: ["no es lo que pedí", "incorrecto", "esto no es", "pedí", "esto no está bien", "no es lo que pedí"]
      },
      frustration: {
        en: ["seriously", "come on", "really", "again", "still"],
        es: ["en serio", "vamos", "de verdad", "otra vez", "todavía", "aún"]
      },
      urgency: {
        en: ["need", "want", "expect", "should"],
        es: ["necesito", "quiero", "espero", "debería"]
      }
    },
    audioMapping: {
      stress_range: [0.6, 0.85],
      confidence_range: [0.3, 0.6],
      energy_range: [-45, -35],
      speech_rate_range: [130, 170]
    },
    businessAction: {
      priority: "high",
      action: "Immediately address complaint, apologize, offer solution, escalate if needed",
      nextSteps: ["Apologize sincerely", "Fix issue immediately", "Offer compensation", "Notify manager", "Follow up"]
    },
    intent: "complaining",
    requires_action: true
  },

  angry_escalation: {
    key: "angry_escalation",
    label: "Angry / Escalation",
    icon: "😡",
    definition: "Very upset, aggressive, hostile. Customer is extremely angry and escalating (demanding manager, threatening review). Requires immediate manager intervention.",
    textPatterns: {
      anger: {
        en: ["unacceptable", "terrible", "awful", "horrible", "worst", "ridiculous"],
        es: ["inaceptable", "terrible", "horrible", "pésimo", "peor", "ridículo"]
      },
      escalation: {
        en: ["manager", "complain", "review", "never coming back", "demand", "speak to"],
        es: ["gerente", "quejarme", "reseña", "nunca volveré", "exijo", "hablar con", "reclamar"]
      },
      intensity: {
        en: ["absolutely", "completely", "totally", "extremely", "very"],
        es: ["absolutamente", "completamente", "totalmente", "extremadamente", "muy"]
      }
    },
    audioMapping: {
      stress_range: [0.8, 1.0],
      confidence_range: [0.1, 0.4],
      energy_range: [-40, -25],
      speech_rate_range: [150, 200]
    },
    businessAction: {
      priority: "critical",
      action: "Immediate manager intervention, de-escalate, resolve, prevent negative review",
      nextSteps: ["Get manager immediately", "Apologize profusely", "Offer significant compensation", "Resolve issue completely", "Follow up after service"]
    },
    intent: "escalating",
    requires_action: true
  },

  confusion_uncertain: {
    key: "confusion_uncertain",
    label: "Confusion / Uncertain",
    icon: "🤔",
    definition: "Hesitant, questioning, uncertain. Customer needs clarification or guidance.",
    textPatterns: {
      uncertainty: {
        en: ["not sure", "don't know", "maybe", "which one", "what do you recommend", "I'm confused"],
        es: ["no estoy seguro", "no sé", "tal vez", "cuál", "qué recomienda", "estoy confundido", "no entiendo"]
      },
      questions: {
        en: ["what is", "how does", "can you explain", "which should I"],
        es: ["qué es", "cómo", "puede explicar", "cuál debería", "qué significa"]
      },
      hesitation: {
        en: ["um", "uh", "well", "hmm", "I guess"],
        es: ["eh", "este", "pues", "bueno", "creo"]
      }
    },
    audioMapping: {
      stress_range: [0.3, 0.6],
      confidence_range: [0.2, 0.5],
      energy_range: [-55, -45],
      speech_rate_range: [80, 120]
    },
    businessAction: {
      priority: "medium",
      action: "Provide guidance, clarify options, offer recommendations",
      nextSteps: ["Explain menu items", "Offer recommendations", "Ask clarifying questions", "Provide detailed information"]
    },
    intent: "questioning",
    requires_action: true
  },

  silent_or_no_speech: {
    key: "silent_or_no_speech",
    label: "Silent / No Speech",
    icon: "🔇",
    definition: "No speech detected, silence, or background noise only. Not a valid tone classification.",
    textPatterns: {
      silence: [""],
      noise: ["*", "...", " "]
    },
    audioMapping: {
      stress_range: [0.0, 0.2],
      confidence_range: [0.0, 0.2],
      energy_range: [-70, -60],
      speech_rate_range: [0, 50]
    },
    businessAction: {
      priority: "none",
      action: "No action needed - silence detected",
      nextSteps: []
    },
    intent: "none",
    requires_action: false
  }
};

const TONE_KEYS = Object.keys(TONE_CATEGORIES);

/**
 * Optimized LLM System Prompt - Bilingual (English/Spanish)
 */
const SYSTEM_PROMPT = `You are a tone classification expert for restaurant/hospitality conversations in English and Spanish.

Classify customer utterances (in English OR Spanish) into exactly ONE of these 10 categories:

1. neutral_casual - Normal conversation, routine interaction
2. positive_friendly - Warm, appreciative, satisfied
3. polite_request - Politely asking for something (menu, order, info)
4. upsell_opportunity - Excited, delighted, high satisfaction
5. neutral_complaint - Factual statement of issue (no emotion)
6. polite_complaint - Polite but raising an issue
7. frustration_complaint - Frustrated, upset, but not aggressive
8. angry_escalation - Very angry, aggressive, escalating (manager, review)
9. confusion_uncertain - Hesitant, questioning, needs guidance
10. silent_or_no_speech - No speech detected

CRITICAL RULES - Categories are MUTUALLY EXCLUSIVE:

COMPLAINT HIERARCHY (choose ONE):
- neutral_complaint: Factual statement ("The soup is cold" / "La sopa está fría") - no emotion
- polite_complaint: Polite phrasing ("Excuse me, but the soup is cold" / "Disculpe, pero la sopa está fría") - respectful
- frustration_complaint: Emotional frustration ("This soup is cold again!" / "¡Esta sopa está fría otra vez!") - upset
- angry_escalation: Aggressive escalation ("This is unacceptable! Get your manager!" / "¡Esto es inaceptable! ¡Traiga al gerente!") - hostile

REQUEST vs CASUAL:
- polite_request: Asking for something ("Could I please have the menu?" / "¿Podría traerme el menú?")
- neutral_casual: Casual conversation ("Hello, how are you?" / "Hola, ¿cómo está?")

POSITIVE CATEGORIES:
- positive_friendly: General appreciation ("Thank you" / "Gracias", "Great service" / "Excelente servicio")
- upsell_opportunity: High excitement ("This is amazing!" / "¡Esto es increíble!", "Best meal ever!" / "¡La mejor comida!")

SPANISH EXAMPLES:
- "Hola, buenas tardes" → neutral_casual
- "Disculpe, pero la sopa está fría" → polite_complaint
- "Esto no es lo que pedí" → frustration_complaint
- "¡Esto es inaceptable! Quiero hablar con el gerente" → angry_escalation
- "¿Podría traerme el menú?" → polite_request
- "¡Esto está delicioso!" → upsell_opportunity
- "No estoy seguro qué pedir" → confusion_uncertain
- "Gracias, todo está perfecto" → positive_friendly

AUDIO SIGNAL GUIDANCE:
- High stress (0.7+) + complaint → frustration_complaint or angry_escalation
- Low stress (0.3-) + positive words → positive_friendly or upsell_opportunity
- Low energy (-55dB) + slow speech (100bpm) → confusion_uncertain
- Moderate stress (0.4-0.6) + polite words + complaint → polite_complaint
- Very low energy (-60dB) + no speech → silent_or_no_speech

TEXT OVERRIDES AUDIO:
- If text clearly expresses complaint → complaint category (even if audio is calm)
- If text clearly expresses satisfaction → positive category (even if audio is stressed)
- Audio helps distinguish between similar categories
- Works for BOTH English and Spanish - classify based on meaning, not language

Respond with ONLY a raw JSON object:
{
  "tone": "<key>",
  "confidence": <0-1>,
  "intent": "<informational|appreciation|requesting|satisfaction|complaining|escalating|questioning|none>",
  "requires_action": <true|false>
}

No markdown, no explanation, no code fences.`;

const MIN_WORDS = 3;
const DEBOUNCE_MS = 1500;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30000;

/**
 * Fallback: Classify tone from acoustic metrics only (when LLM fails)
 * Uses fuzzy matching with weighted scoring
 */
function classifyFromAcousticOnly(metrics) {
  if (!metrics) return { tone: "neutral_casual", score: 0.5, source: "acoustic_fallback" };

  const stress = metrics.stress_level || 0;
  const confidence = metrics.confidence_level || 0;
  const energy = metrics.energy_db || -60;
  const speechRate = metrics.speech_rate || 0;

  // Check for silence first
  if (energy < -60 && speechRate < 50 && confidence < 0.2) {
    return { 
      tone: "silent_or_no_speech", 
      score: 0.8, 
      source: "acoustic_fallback",
      intent: "none",
      requires_action: false
    };
  }

  // Calculate similarity score for each tone category
  const scores = {};
  
  for (const [key, category] of Object.entries(TONE_CATEGORIES)) {
    if (key === "silent_or_no_speech") continue; // Already handled
    
    const audio = category.audioMapping;
    
    const stressScore = calculateRangeScore(stress, audio.stress_range);
    const confidenceScore = calculateRangeScore(confidence, audio.confidence_range);
    const energyScore = calculateRangeScore(energy, audio.energy_range);
    const speechRateScore = calculateRangeScore(speechRate, audio.speech_rate_range);
    
    const weightedScore = (
      stressScore * 0.35 +
      confidenceScore * 0.30 +
      energyScore * 0.20 +
      speechRateScore * 0.15
    );
    
    scores[key] = weightedScore;
  }

  const bestMatch = Object.entries(scores).reduce((a, b) => 
    scores[a[0]] > scores[b[0]] ? a : b
  );

  if (bestMatch[1] >= 0.4) {
    const category = TONE_CATEGORIES[bestMatch[0]];
    return { 
      tone: bestMatch[0], 
      score: Math.min(0.75, bestMatch[1]),
      source: "acoustic_fallback",
      intent: category.intent || "informational",
      requires_action: category.requires_action || false
    };
  }

  // Fallback rules
  if (stress > 0.7 && confidence < 0.4) {
    return { tone: "frustration_complaint", score: 0.65, source: "acoustic_fallback", intent: "complaining", requires_action: true };
  }
  if (stress > 0.85) {
    return { tone: "angry_escalation", score: 0.7, source: "acoustic_fallback", intent: "escalating", requires_action: true };
  }
  if (energy < -55 && speechRate < 100) {
    return { tone: "confusion_uncertain", score: 0.6, source: "acoustic_fallback", intent: "questioning", requires_action: true };
  }
  if (confidence > 0.7 && stress < 0.5) {
    return { tone: "upsell_opportunity", score: 0.6, source: "acoustic_fallback", intent: "satisfaction", requires_action: true };
  }

  return { tone: "neutral_casual", score: 0.5, source: "acoustic_fallback", intent: "informational", requires_action: false };
}

/**
 * Calculate how close a value is to a range (fuzzy matching)
 */
function calculateRangeScore(value, range) {
  const [min, max] = range;
  
  if (value >= min && value <= max) {
    return 1.0;
  }
  
  const rangeSize = max - min;
  const tolerance = rangeSize * 0.5;
  
  if (value < min) {
    const distance = min - value;
    return Math.max(0, 1.0 - (distance / tolerance));
  } else {
    const distance = value - max;
    return Math.max(0, 1.0 - (distance / tolerance));
  }
}

/**
 * Safe JSON parsing with fallback
 */
function safeParseJSON(str) {
  try {
    const cleaned = str.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    const jsonMatch = str.match(/\{[^}]*"tone"[^}]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    throw new Error(`Invalid JSON: ${err.message}`);
  }
}

export class ToneClassifier {
  constructor(onToneResult) {
    this._onToneResult = onToneResult;
    this._currentSpeaker = null;
    this._currentText = "";
    this._latestMetrics = null;
    this._timer = null;
    this._processing = false;
    this._closed = false;
    this._lastClassifiedText = "";
    
    this._circuitBreakerFailures = 0;
    this._circuitBreakerOpen = false;
    this._circuitBreakerOpenTime = null;
    
    this._stats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      fallbackCalls: 0,
      rateLimitHits: 0,
    };
  }

  setAcousticMetrics(metrics) {
    if (this._closed) return;
    this._latestMetrics = metrics;
  }

  addText(speaker, text) {
    if (this._closed || !text?.trim()) return;

    if (speaker !== this._currentSpeaker) {
      if (this._currentSpeaker && this._currentText.trim()) {
        this._classifyNow(this._currentSpeaker, this._currentText.trim());
      }
      this._currentSpeaker = speaker;
      this._currentText = text;
      this._lastClassifiedText = "";
    } else {
      this._currentText += " " + text;
    }

    this._scheduleClassify();
  }

  async flush() {
    if (this._closed) return;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._currentSpeaker && this._currentText.trim()) {
      await this._classifyNow(this._currentSpeaker, this._currentText.trim());
    }
  }

  close() {
    this._closed = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  getStats() {
    return { ...this._stats };
  }

  getToneCategory(toneKey) {
    return TONE_CATEGORIES[toneKey] || null;
  }

  getAllToneCategories() {
    return TONE_CATEGORIES;
  }

  _scheduleClassify() {
    if (this._timer) clearTimeout(this._timer);

    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._closed && this._currentSpeaker && this._currentText.trim()) {
        this._classifyNow(this._currentSpeaker, this._currentText.trim());
      }
    }, DEBOUNCE_MS);
  }

  _checkCircuitBreaker() {
    if (this._circuitBreakerOpen && Date.now() - this._circuitBreakerOpenTime > CIRCUIT_BREAKER_RESET_MS) {
      this._circuitBreakerOpen = false;
      this._circuitBreakerFailures = 0;
      console.log("🔓 ToneClassifier: Circuit breaker reset");
    }
    return this._circuitBreakerOpen;
  }

  _recordFailure() {
    this._circuitBreakerFailures++;
    this._stats.failedCalls++;
    
    if (this._circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this._circuitBreakerOpen = true;
      this._circuitBreakerOpenTime = Date.now();
      console.warn(`🔴 ToneClassifier: Circuit breaker OPEN (${this._circuitBreakerFailures} failures)`);
    }
  }

  _recordSuccess() {
    this._circuitBreakerFailures = 0;
    if (this._circuitBreakerOpen) {
      this._circuitBreakerOpen = false;
      console.log("🟢 ToneClassifier: Circuit breaker CLOSED");
    }
    this._stats.successCalls++;
  }

  async _classifyNow(speaker, text, retryCount = 0) {
    const wordCount = text.split(/\s+/).length;
    if (wordCount < MIN_WORDS) return;
    if (text === this._lastClassifiedText) return;
    if (this._processing) return;

    if (this._checkCircuitBreaker()) {
      console.warn("🔴 ToneClassifier: Circuit breaker OPEN, using fallback");
      const fallback = classifyFromAcousticOnly(this._latestMetrics);
      this._stats.fallbackCalls++;
      const category = TONE_CATEGORIES[fallback.tone];
      this._onToneResult({
        speaker,
        tone: fallback.tone,
        score: fallback.score,
        confidence: fallback.score,
        text_snippet: text.slice(0, 100),
        source: fallback.source,
        intent: fallback.intent,
        requires_action: fallback.requires_action,
        businessAction: category?.businessAction || null,
      });
      return;
    }

    this._processing = true;
    this._lastClassifiedText = text;
    this._stats.totalCalls++;

    try {
      if (!speaker || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Invalid input: speaker or text missing");
      }

      const m = this._latestMetrics;
      const metricsLine = m
        ? `Acoustic: stress=${Math.round((m.stress_level || 0) * 100)}%, confidence=${Math.round((m.confidence_level || 0) * 100)}%, energy=${m.energy_db || -60}dB, speech_rate=${m.speech_rate || 0}bpm`
        : "Acoustic: not available";

      const role = speaker === "S1" ? "WAITER" : "CUSTOMER";

      const userMsg = `Speaker: ${role}\nText: "${text.slice(0, 500)}"\n${metricsLine}\n\nRespond: {"tone":"<key>","confidence":<0-1>,"intent":"<intent>","requires_action":<true|false>}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 60,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error("Empty response from OpenAI");
      }

      const result = safeParseJSON(raw);

      if (!result.tone || typeof result.tone !== "string") {
        throw new Error(`Invalid response: missing or invalid 'tone' field`);
      }

      // Filter out silence
      if (result.tone === "silent_or_no_speech") {
        return;
      }

      if (!TONE_KEYS.includes(result.tone)) {
        console.warn(`⚠️ ToneClassifier: Unknown tone key '${result.tone}', using fallback`);
        const fallback = classifyFromAcousticOnly(m);
        this._stats.fallbackCalls++;
        const category = TONE_CATEGORIES[fallback.tone];
        this._onToneResult({
          speaker,
          tone: fallback.tone,
          score: fallback.score,
          confidence: fallback.score,
          text_snippet: text.slice(0, 100),
          source: fallback.source,
          intent: fallback.intent,
          requires_action: fallback.requires_action,
          businessAction: category?.businessAction || null,
        });
        return;
      }

      this._recordSuccess();

      const category = TONE_CATEGORIES[result.tone];

      this._onToneResult({
        speaker,
        tone: result.tone,
        score: Math.max(0, Math.min(1, result.confidence || 0.8)),
        confidence: Math.max(0, Math.min(1, result.confidence || 0.8)),
        text_snippet: text.slice(0, 100),
        source: "llm",
        intent: result.intent || category.intent || "informational",
        requires_action: result.requires_action !== undefined ? result.requires_action : (category.requires_action || false),
        businessAction: category?.businessAction || null,
      });
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes("rate limit");
      const isTimeout = err.message?.includes("timeout") || err.code === "ETIMEDOUT";
      
      if (isRateLimit) {
        this._stats.rateLimitHits++;
        console.warn(`⚠️ ToneClassifier: Rate limit hit (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      }

      if (retryCount < MAX_RETRIES && (isRateLimit || isTimeout || err.status >= 500)) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.log(`🔄 ToneClassifier: Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        this._processing = false;
        return this._classifyNow(speaker, text, retryCount + 1);
      }

      this._recordFailure();
      console.error(`❌ ToneClassifier error (${err.message}): Using acoustic fallback`);
      
      const fallback = classifyFromAcousticOnly(this._latestMetrics);
      this._stats.fallbackCalls++;
      const category = TONE_CATEGORIES[fallback.tone];
      this._onToneResult({
        speaker,
        tone: fallback.tone,
        score: fallback.score,
        confidence: fallback.score,
        text_snippet: text.slice(0, 100),
        source: fallback.source,
        intent: fallback.intent,
        requires_action: fallback.requires_action,
        businessAction: category?.businessAction || null,
      });
    } finally {
      this._processing = false;
    }
  }
}

// Export tone categories for use in other modules
export { TONE_CATEGORIES, TONE_KEYS };
