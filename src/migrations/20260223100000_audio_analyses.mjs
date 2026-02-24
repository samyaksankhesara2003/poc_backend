/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    return knex.schema.createTable("audio_analyses", function (table) {
        table.increments("id").primary();
        table
            .integer("session_id")
            .unsigned()
            .notNullable()
            .references("id")
            .inTable("sessions")
            .onDelete("CASCADE");
        table.string("unique_session_id").notNullable().index();

        // Tone analysis (from raw audio signal)
        table.json("tone_snapshots");       // array of per-window tone results
        table.string("dominant_emotion");    // most frequent emotion across session
        table.float("avg_stress_level");
        table.float("avg_confidence_level");
        table.float("avg_energy");
        table.float("avg_speech_rate");
        table.float("avg_pitch_hz");
        table.float("avg_pitch_variation");
        table.string("overall_sentiment_audio");  // positive / negative / neutral

        // Content analysis (from transcript + AI)
        table.json("content_analysis");     // latest full content analysis payload
        table.json("topics");               // aggregated topics
        table.json("key_phrases");          // aggregated key phrases
        table.string("primary_intent");
        table.string("overall_sentiment_text");
        table.json("toxicity");             // { detected, level, flags }
        table.json("risk_signals");         // { detected, signals }
        table.text("summary");

        table.timestamps(true, true);
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    return knex.schema.dropTableIfExists("audio_analyses");
}
