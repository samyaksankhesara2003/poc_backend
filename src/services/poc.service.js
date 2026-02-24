import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import dotenv from "dotenv";
import OpenAI from "openai";
import Waiter from "../models/Waiter.js";
dotenv.config();
import storageService from "./minio.service.js";
import awsService from "./aws.service.js";
import { Pinecone } from "@pinecone-database/pinecone";
import Table from "../models/Table.js";
import SessionModel from "../models/Session.js";
import ConversationModel from "../models/Conversation.js";
// const pc = new Pinecone({
//     apiKey: process.env.PINECONE_API_KEY,
// });
// const namespace = pc.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST).namespace(process.env.PINECONE_NAMESPACE);

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
 * Upload waiter audio to MinIO and store the MinIO key in waiter.audio_path (minio:<key>).
 * Old MinIO object is deleted if it existed; local file is not used.
 * @param {{ buffer: Buffer, originalname: string }} file - multer file
 * @param {{ username: string, email: string }} body
 * @returns {{ message: string, user: object }}
 */


//-- upload waiter audio to minio
const uploadWaiterAudio = async (file, body) => {
    const { username, email } = body;

    if (!email) {
        throw new Error('Email is required');
    }

    const waiter = await Waiter.query().findOne({ email });
    if (!waiter) {
        throw new Error('Waiter not found for this email');
    }

    if (waiter.audio_path) {
        try {
            //minio service
            // await storageService.deleteObject(waiter.audio_path);

            //aws service
            await awsService.deleteObject(waiter.audio_path);
        } catch (err) {
            console.warn(
                '[uploadWaiterAudio] Failed to delete old MinIO object:',
                err?.message
            );
        }
    }

    const ext = path.extname(file.originalname) || '.wav';
    const safeName = sanitizeUsername(username);

    const objectKey = `waiteraudio/${safeName}${ext}`;

    //minio service
    // await storageService.uploadBuffer(objectKey, file.buffer);

    //aws service
    await awsService.uploadBuffer(objectKey, file.buffer);

    await Waiter.query()
        .findOne({ email })
        .patch({ audio_path: objectKey });

    const updated = await Waiter.query()
        .select(
            'id',
            'username',
            'email',
            'audio_path',
            'created_at',
            'updated_at'
        )
        .findOne({ email });

    return {
        message: 'Audio saved successfully',
        user: updated,
    };
};

// ─── Previous implementation (local) ───
// const uploadWaiterAudio = async (file, body) => {
//     const { username, email } = body;
//     if (!email) throw new Error('Email is required');
//     const waiter = await Waiter.query().findOne({ email });
//     if (!waiter) throw new Error('Waiter not found for this email');
//     if (waiter.audio_path) {
//         const oldPath = path.isAbsolute(waiter.audio_path)
//             ? waiter.audio_path
//             : path.join(process.cwd(), waiter.audio_path);
//         if (fs.existsSync(oldPath)) {
//             fs.unlinkSync(oldPath);
//         }
//     }
//     const ext = path.extname(file.originalname) || '.wav';
//     const safeName = sanitizeUsername(username);
//     const fileName = `${safeName}${ext}`;
//     if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
//     const filePath = path.join(UPLOAD_DIR, fileName);
//     fs.writeFileSync(filePath, file.buffer);
//     const storedPath = `${UPLOAD_DIR}/${fileName}`;
//     await Waiter.query().findOne({ email }).patch({ audio_path: storedPath });
//     const updated = await Waiter.query()
//         .select('id', 'username', 'email', 'audio_path', 'created_at', 'updated_at')
//         .findOne({ email });
//     return { message: 'Audio saved successfully', user: updated };
// };


const SESSION_CONVERSATION_DIR = 'sessionConservation';

// minio upload file function
const uploadConversationAudio = async (file, unique_session_id) => {
    if (!file || !file.buffer || !unique_session_id) {
        throw new Error('Audio file and unique_session_id are required');
    }
    const ext = path.extname(file.originalname) || '.wav';
    const timestamp = Date.now();
    const fileName = `${unique_session_id}_${timestamp}${ext}`;
    const objectKey = `${SESSION_CONVERSATION_DIR}/${fileName}`;
    //minio service
    // await storageService.uploadBuffer(objectKey, file.buffer);

    //aws service
    await awsService.uploadBuffer(objectKey, file.buffer);

    return { audio_path: objectKey };
};

/* ─── Previous: save conversation audio to local filesystem ───
const SESSION_CONVERSATION_DIR = 'sessionConservation';
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
*/

const getTablesService = async () => {
    try {
        const tables = await Table.query().select('id', 'table_number');
        return { message: 'Tables fetched successfully', data: tables };
    } catch (error) {
        throw new Error('Failed to fetch tables');
    }
};


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
    // let conversation = await ConversationModel.query().findOne({ unique_session_id });
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
export const pocService = {
    loginService,
    uploadWaiterAudio,
    uploadConversationAudio,
    getTablesService,
    createSessionService,
};