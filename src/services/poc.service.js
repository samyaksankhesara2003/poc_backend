import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import dotenv from "dotenv";
import OpenAI from "openai";
import Waiter from "../models/Waiter.js";
dotenv.config();

import { Pinecone } from "@pinecone-database/pinecone";
import Table from "../models/Table.js";
import SessionModel from "../models/Session.js";
import ConversationModel from "../models/Conversation.js";
import AudioAnalysis from "../models/AudioAnalysis.js";
const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const namespace = pc.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST).namespace(process.env.PINECONE_NAMESPACE);

const execAsync = promisify(exec);

const loginService = async (body) => {
    const { email } = body;
    const waiter = await Waiter.query()
        .select('id', 'username', 'email', 'audio_path', 'created_at', 'updated_at')
        .findOne({ email });
    if (!waiter) {
        return { message: 'Waiter not found', status: false };
    }
    return { message: 'Waiter found', status: true, data: waiter };
};

const UPLOAD_DIR = 'waiteraudio';

/** Sanitize username for use in filename (no path chars, no empty) */
function sanitizeUsername(username) {
    if (!username || typeof username !== 'string') return 'waiter';
    return username.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'waiter';
}

/**
 * Save audio file to waiteraudio/waiterusername.ext and update waiter.audio_path by email.
 * @param {{ buffer: Buffer, originalname: string }} file - multer file
 * @param {{ username: string, email: string }} body
 * @returns {{ message: string, user: object }}
 */
const uploadWaiterAudio = async (file, body) => {
    const { username, email } = body;
    if (!email) throw new Error('Email is required');
    const waiter = await Waiter.query().findOne({ email });
    if (!waiter) throw new Error('Waiter not found for this email');

    // If waiter already has an audio sample, remove the old file so the new one replaces it
    if (waiter.audio_path) {
        const oldPath = path.isAbsolute(waiter.audio_path)
            ? waiter.audio_path
            : path.join(process.cwd(), waiter.audio_path);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }

    const ext = path.extname(file.originalname) || '.wav';
    const safeName = sanitizeUsername(username);
    const fileName = `${safeName}${ext}`;

    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    const storedPath = `${UPLOAD_DIR}/${fileName}`;
    await Waiter.query().findOne({ email }).patch({ audio_path: storedPath });
    const updated = await Waiter.query()
        .select('id', 'username', 'email', 'audio_path', 'created_at', 'updated_at')
        .findOne({ email });

    return { message: 'Audio saved successfully', user: updated };
};

const SESSION_CONVERSATION_DIR = 'sessionConservation';

/**
 * POST /poc/upload-conversation: multipart 'audio' file + body unique_session_id.
 * Saves to sessionConservation/unique_session_id_timestamp.ext
 * Returns { audio_path: 'sessionConservation/unique_session_id_timestamp.wav' }
 */
const uploadConversationAudio = async (file, unique_session_id) => {
    if (!file || !file.buffer || !unique_session_id) {
        throw new Error('Audio file and unique_session_id are required');
    }
    const ext = path.extname(file.originalname) || '.wav';
    const timestamp = Date.now();
    const fileName = `${unique_session_id}_${timestamp}${ext}`;
    if (!fs.existsSync(SESSION_CONVERSATION_DIR)) {
        fs.mkdirSync(SESSION_CONVERSATION_DIR, { recursive: true });
    }
    const filePath = path.join(SESSION_CONVERSATION_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);
    const audio_path = `${SESSION_CONVERSATION_DIR}/${fileName}`;
    return { audio_path };
};

const getTablesService = async () => {
    try {
        const tables = await Table.query().select('id', 'table_number');
        return { message: 'Tables fetched successfully', data: tables };
    } catch (error) {
        throw new Error('Failed to fetch tables');
    }
};

/**
 * POST /poc/session body: unique_session_id, waiter_id, table_id, transcriptions (JSON), audio_path, status ('stop' | 'end')
 * 1. Find or create session by unique_session_id.
 * 2. If status 'end': update existing conversation for this session to status 'end' and transcriptions; or create one.
 * 3. If status 'stop': create new conversation row (or upsert) with status 'stop'.
 * Note: conversations.unique_session_id is unique, so one conversation row per session for now; we update it on 'end'.
 */
const createSessionService = async (body) => {
    const { unique_session_id, waiter_id, table_id, transcriptions, audio_path, status } = body;
    if (!unique_session_id || !waiter_id || !table_id || status === undefined) {
        throw new Error('unique_session_id, waiter_id, table_id and status are required');
    }

    let session = await SessionModel.query().findOne({ unique_session_id });
    if (!session) {
        session = await SessionModel.query().insertAndFetch({
            waiter_id: Number(waiter_id),
            table_id: Number(table_id),
            unique_session_id,
        });
    }

    const transcriptionsArray = typeof transcriptions === 'string'
        ? JSON.parse(transcriptions)
        : (transcriptions || []);
    // MySQL JSON column: pass string so Knex doesn't spread the array
    const transcriptionsForDb = JSON.stringify(transcriptionsArray);

    const conversationPayload = {
        session_id: session.id,
        unique_session_id,
        audio_path: audio_path || `${unique_session_id}.wav`,
        status: status === 'end' ? 'end' : 'stop',
        transcriptions: transcriptionsForDb,
    };
    let conversation = await ConversationModel.query().findOne({ unique_session_id });
    // if (conversation) {
    //     await ConversationModel.query().findById(conversation.id).patch({
    //         status: conversationPayload.status,
    //         transcriptions: conversationPayload.transcriptions,
    //         audio_path: conversationPayload.audio_path,
    //     });
    // } else {
    //     await ConversationModel.query().insert(conversationPayload);
    // }

    await ConversationModel.query().insert(conversationPayload);

    return { message: 'Session saved', session_id: session.id, status };
};

/**
 * POST /poc/save-analysis
 * body: { unique_session_id, tone_snapshots, content_analysis }
 * Aggregates tone snapshots and persists both tone + content analysis.
 */
const saveAnalysisService = async (body) => {
    const { unique_session_id, tone_snapshots, content_analysis } = body;
    if (!unique_session_id) {
        throw new Error('unique_session_id is required');
    }

    const session = await SessionModel.query().findOne({ unique_session_id });
    if (!session) {
        throw new Error('Session not found for this unique_session_id');
    }

    const snaps = Array.isArray(tone_snapshots) ? tone_snapshots : [];
    const validSnaps = snaps.filter(
        (s) => s?.tone_analysis && s.tone_analysis.voice_quality !== 'silence'
    );

    let dominant_emotion = 'neutral';
    let avg_stress = 0, avg_confidence = 0, avg_energy = 0;
    let avg_rate = 0, avg_pitch = 0, avg_pv = 0;
    let sentiment_audio = 'neutral';

    if (validSnaps.length > 0) {
        const emotionCounts = {};
        let sentSum = 0;

        for (const s of validSnaps) {
            const t = s.tone_analysis;
            emotionCounts[t.emotion] = (emotionCounts[t.emotion] || 0) + 1;
            avg_stress += t.stress_level || 0;
            avg_confidence += t.confidence_level || 0;
            avg_energy += t.energy || 0;
            avg_rate += t.speech_rate || 0;
            avg_pitch += t.pitch_mean_hz || 0;
            avg_pv += t.pitch_variation || 0;
            sentSum += t.sentiment_polarity || 0;
        }

        const n = validSnaps.length;
        avg_stress /= n;
        avg_confidence /= n;
        avg_energy /= n;
        avg_rate /= n;
        avg_pitch /= n;
        avg_pv /= n;
        const avgSent = sentSum / n;

        dominant_emotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0];
        sentiment_audio = avgSent > 0.15 ? 'positive' : avgSent < -0.15 ? 'negative' : 'neutral';
    }

    const ca = content_analysis?.content_analysis || content_analysis || null;

    const payload = {
        session_id: session.id,
        unique_session_id,
        tone_snapshots: snaps,
        dominant_emotion,
        avg_stress_level: avg_stress,
        avg_confidence_level: avg_confidence,
        avg_energy,
        avg_speech_rate: avg_rate,
        avg_pitch_hz: avg_pitch,
        avg_pitch_variation: avg_pv,
        overall_sentiment_audio: sentiment_audio,
        content_analysis: ca,
        topics: ca?.topics || null,
        key_phrases: ca?.key_phrases || null,
        primary_intent: ca?.intent?.primary || null,
        overall_sentiment_text: ca?.sentiment?.soverall || null,
        toxicity: ca?.toxicity || null,
        risk_signals: ca?.risk_signals || null,
        summary: ca?.summary || null,
    };

    const existing = await AudioAnalysis.query().findOne({ unique_session_id });
    if (existing) {
        await AudioAnalysis.query().findById(existing.id).patch(payload);
    } else {
        await AudioAnalysis.query().insert(payload);
    }

    return { message: 'Analysis saved', session_id: session.id };
};

/**
 * GET /poc/analysis/:unique_session_id
 */
const getAnalysisService = async (unique_session_id) => {
    const analysis = await AudioAnalysis.query().findOne({ unique_session_id });
    if (!analysis) {
        return { message: 'No analysis found', data: null };
    }
    return { message: 'Analysis found', data: analysis };
};

export const pocService = {
    loginService,
    uploadWaiterAudio,
    uploadConversationAudio,
    getTablesService,
    createSessionService,
    saveAnalysisService,
    getAnalysisService,
};