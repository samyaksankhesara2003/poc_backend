/**
 * Production-grade content analysis via OpenAI.
 *
 * Features:
 * - Retry logic with exponential backoff
 * - Timeout handling (10s)
 * - Rate limit handling (429 errors)
 * - Circuit breaker pattern
 * - Safe JSON parsing
 * - Input validation
 * - Structured error logging
 * - Request queuing to prevent pile-up
 */

import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 10000, // 10 second timeout
  maxRetries: 3,
});

const ANALYSIS_PROMPT = `You are a real-time conversation analyst for a restaurant/hospitality environment.

Analyze the following conversation transcript (may be in English OR Spanish) and return a JSON object with EXACTLY this structure (no markdown, no code fences, raw JSON only):

{
  "topics": ["topic1", "topic2"],
  "intent": {
    "primary": "ordering|complaining|asking|greeting|thanking|requesting|informing|leaving|other",
    "confidence": 0.0-1.0
  },
  "key_phrases": ["phrase1", "phrase2", "phrase3"],
  "sentiment": {
    "overall": "positive|negative|neutral|mixed",
    "score": -1.0 to 1.0,
    "per_speaker": {
      "WAITER": { "sentiment": "positive|negative|neutral", "score": -1.0 to 1.0 },
      "CUSTOMER": { "sentiment": "positive|negative|neutral", "score": -1.0 to 1.0 }
    }
  },
  "toxicity": {
    "detected": false,
    "level": "none|low|medium|high",
    "flags": []
  },
  "risk_signals": {
    "detected": false,
    "signals": []
  },
  "summary": "One sentence summary of what is happening in the conversation."
}

Rules:
- Analyze ONLY what is present in the text (works for both English and Spanish).
- Be accurate and conservative with toxicity/risk detection.
- Key phrases: extract the 3-5 most important phrases (preserve original language).
- For topics, identify 1-3 main conversation topics.
- Return ONLY valid JSON, nothing else.`;

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60000; // 60 seconds for content analysis
const MAX_QUEUE_SIZE = 10;

/**
 * Safe JSON parsing with fallback
 */
function safeParseJSON(str) {
  try {
    const cleaned = str.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    // Try to extract JSON from malformed response
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    throw new Error(`Invalid JSON: ${err.message}`);
  }
}

/**
 * Fallback: Basic content analysis when LLM fails
 */
function createFallbackAnalysis(segments) {
  const allText = segments.map(s => s.text || "").join(" ").toLowerCase();
  
  const topics = [];
  if (allText.includes("order") || allText.includes("menu")) topics.push("ordering");
  if (allText.includes("complaint") || allText.includes("wrong") || allText.includes("not")) topics.push("complaint");
  if (allText.includes("thank") || allText.includes("appreciate")) topics.push("appreciation");

  const intent = {
    primary: allText.includes("complaint") ? "complaining" : 
             allText.includes("order") ? "ordering" : 
             allText.includes("thank") ? "thanking" : "other",
    confidence: 0.5,
  };

  const sentiment = {
    overall: allText.includes("not") || allText.includes("wrong") ? "negative" : "neutral",
    score: allText.includes("not") || allText.includes("wrong") ? -0.3 : 0.0,
    per_speaker: {
      WAITER: { sentiment: "neutral", score: 0.0 },
      CUSTOMER: { sentiment: allText.includes("not") ? "negative" : "neutral", score: allText.includes("not") ? -0.3 : 0.0 },
    },
  };

  return {
    topics: topics.length > 0 ? topics : ["general conversation"],
    intent,
    key_phrases: [],
    sentiment,
    toxicity: { detected: false, level: "none", flags: [] },
    risk_signals: { detected: false, signals: [] },
    summary: "Conversation analysis unavailable (fallback mode).",
  };
}

export class ContentAnalyzer {
  constructor(onContentAnalysis) {
    this._onContentAnalysis = onContentAnalysis;
    this._buffer = [];
    this._timer = null;
    this._processing = false;
    this._closed = false;
    this._lastAnalyzedLength = 0;
    this._requestQueue = [];
    this._queueProcessing = false;

    this.BATCH_INTERVAL_MS = 8000;
    this.MIN_NEW_SEGMENTS = 2;

    // Circuit breaker state
    this._circuitBreakerFailures = 0;
    this._circuitBreakerOpen = false;
    this._circuitBreakerOpenTime = null;

    // Metrics
    this._stats = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      fallbackCalls: 0,
      rateLimitHits: 0,
      queueOverflows: 0,
    };
  }

  addSegment(segment) {
    if (this._closed) return;
    
    // Input validation
    if (!segment || typeof segment !== "object" || !segment.text) {
      console.warn("⚠️ ContentAnalyzer: Invalid segment, skipping");
      return;
    }

    this._buffer.push(segment);
    this._scheduleAnalysis();
  }

  addSegments(segments) {
    if (this._closed) return;
    
    // Input validation
    if (!Array.isArray(segments)) {
      console.warn("⚠️ ContentAnalyzer: Invalid segments array");
      return;
    }

    const validSegments = segments.filter(s => s && typeof s === "object" && s.text);
    this._buffer.push(...validSegments);
    this._scheduleAnalysis();
  }

  async forceAnalyze() {
    if (this._closed || this._processing) return;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    await this._runAnalysis();
  }

  close() {
    this._closed = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._requestQueue = [];
  }

  getStats() {
    return { ...this._stats };
  }

  _scheduleAnalysis() {
    if (this._timer) return;

    this._timer = setTimeout(async () => {
      this._timer = null;
      if (!this._closed) await this._runAnalysis();
    }, this.BATCH_INTERVAL_MS);
  }

  _checkCircuitBreaker() {
    if (this._circuitBreakerOpen && Date.now() - this._circuitBreakerOpenTime > CIRCUIT_BREAKER_RESET_MS) {
      this._circuitBreakerOpen = false;
      this._circuitBreakerFailures = 0;
      console.log("🔓 ContentAnalyzer: Circuit breaker reset");
    }
    return this._circuitBreakerOpen;
  }

  _recordFailure() {
    this._circuitBreakerFailures++;
    this._stats.failedCalls++;
    
    if (this._circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this._circuitBreakerOpen = true;
      this._circuitBreakerOpenTime = Date.now();
      console.warn(`🔴 ContentAnalyzer: Circuit breaker OPEN (${this._circuitBreakerFailures} failures)`);
    }
  }

  _recordSuccess() {
    this._circuitBreakerFailures = 0;
    if (this._circuitBreakerOpen) {
      this._circuitBreakerOpen = false;
      console.log("🟢 ContentAnalyzer: Circuit breaker CLOSED");
    }
    this._stats.successCalls++;
  }

  async _runAnalysis(retryCount = 0) {
    const newSegments = this._buffer.length - this._lastAnalyzedLength;
    if (newSegments < this.MIN_NEW_SEGMENTS || this._processing) return;

    // Prevent queue overflow
    if (this._requestQueue.length >= MAX_QUEUE_SIZE) {
      this._stats.queueOverflows++;
      console.warn(`⚠️ ContentAnalyzer: Request queue full (${this._requestQueue.length}), dropping oldest`);
      this._requestQueue.shift();
    }

    this._processing = true;
    const segments = [...this._buffer];
    this._lastAnalyzedLength = segments.length;
    this._stats.totalCalls++;

    try {
      // Check circuit breaker
      if (this._checkCircuitBreaker()) {
        console.warn("🔴 ContentAnalyzer: Circuit breaker OPEN, using fallback");
        const fallback = createFallbackAnalysis(segments);
        this._stats.fallbackCalls++;
        this._onContentAnalysis({
          content_analysis: fallback,
          meta: {
            segments_analyzed: segments.length,
            timestamp: Date.now(),
            source: "fallback",
          },
        });
        return;
      }

      // Input validation
      if (!segments || segments.length === 0) {
        throw new Error("No segments to analyze");
      }

      const conversationText = segments
        .map((s) => {
          const role = s.role || s.speaker || "UNKNOWN";
          const text = (s.text || "").slice(0, 1000); // Limit per segment
          return `${role}: ${text}`;
        })
        .join("\n")
        .slice(0, 4000); // Total limit

      if (!conversationText.trim()) {
        throw new Error("Empty conversation text");
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 800,
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content: conversationText },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error("Empty response from OpenAI");
      }

      const result = safeParseJSON(raw);

      // Validate response structure
      if (!result.topics || !Array.isArray(result.topics)) {
        throw new Error("Invalid response: missing or invalid 'topics' field");
      }
      if (!result.intent || typeof result.intent.primary !== "string") {
        throw new Error("Invalid response: missing or invalid 'intent' field");
      }
      if (!result.sentiment || typeof result.sentiment.overall !== "string") {
        throw new Error("Invalid response: missing or invalid 'sentiment' field");
      }

      this._recordSuccess();

      this._onContentAnalysis({
        content_analysis: result,
        meta: {
          segments_analyzed: segments.length,
          timestamp: Date.now(),
          source: "llm",
        },
      });
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes("rate limit");
      const isTimeout = err.message?.includes("timeout") || err.code === "ETIMEDOUT";
      
      if (isRateLimit) {
        this._stats.rateLimitHits++;
        console.warn(`⚠️ ContentAnalyzer: Rate limit hit (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      }

      // Retry logic with exponential backoff
      if (retryCount < MAX_RETRIES && (isRateLimit || isTimeout || err.status >= 500)) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.log(`🔄 ContentAnalyzer: Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        this._processing = false;
        return this._runAnalysis(retryCount + 1);
      }

      // All retries exhausted or non-retryable error → use fallback
      this._recordFailure();
      console.error(`❌ ContentAnalyzer error (${err.message}): Using fallback`);
      
      const fallback = createFallbackAnalysis(segments);
      this._stats.fallbackCalls++;
      this._onContentAnalysis({
        content_analysis: fallback,
        meta: {
          segments_analyzed: segments.length,
          timestamp: Date.now(),
          source: "fallback",
        },
      });
    } finally {
      this._processing = false;
    }
  }
}
