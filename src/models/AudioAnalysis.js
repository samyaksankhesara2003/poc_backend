import { Model } from "objection";
import Session from "./Session.js";

class AudioAnalysis extends Model {
  static get tableName() {
    return "audio_analyses";
  }

  static get jsonSchema() {
    return {
      type: "object",
      required: ["session_id", "unique_session_id"],
      properties: {
        id: { type: "integer" },
        session_id: { type: "integer" },
        unique_session_id: { type: "string" },
        tone_snapshots: { type: ["array", "null"] },
        dominant_emotion: { type: ["string", "null"] },
        avg_stress_level: { type: ["number", "null"] },
        avg_confidence_level: { type: ["number", "null"] },
        avg_energy: { type: ["number", "null"] },
        avg_speech_rate: { type: ["number", "null"] },
        avg_pitch_hz: { type: ["number", "null"] },
        avg_pitch_variation: { type: ["number", "null"] },
        overall_sentiment_audio: { type: ["string", "null"] },
        content_analysis: { type: ["object", "null"] },
        topics: { type: ["array", "null"] },
        key_phrases: { type: ["array", "null"] },
        primary_intent: { type: ["string", "null"] },
        overall_sentiment_text: { type: ["string", "null"] },
        toxicity: { type: ["object", "null"] },
        risk_signals: { type: ["object", "null"] },
        summary: { type: ["string", "null"] },
      },
    };
  }

  static get jsonAttributes() {
    return [
      "tone_snapshots",
      "content_analysis",
      "topics",
      "key_phrases",
      "toxicity",
      "risk_signals",
    ];
  }

  static get relationMappings() {
    return {
      session: {
        relation: Model.BelongsToOneRelation,
        modelClass: Session,
        join: {
          from: "audio_analyses.session_id",
          to: "sessions.id",
        },
      },
    };
  }
}

export default AudioAnalysis;
