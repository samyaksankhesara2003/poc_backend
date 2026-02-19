import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RECORDINGS_DIR = path.resolve(__dirname, '../../recordings');
const OUTPUT_FILE = path.join(RECORDINGS_DIR, 'recording.pcm');

// Ensure recordings dir exists at import time
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Changed: noServer:true so server.js can route upgrades manually
export const saveAudioWss = new WebSocketServer({ noServer: true });

saveAudioWss.on('connection', (ws) => {
    console.log('[save-audio] Client connected');
    const pcmChunks = [];

    ws.on('message', (data, isBinary) => {
        if (isBinary) {
            pcmChunks.push(Buffer.from(data));
            return;
        }
        try {
            const msg = JSON.parse(data.toString());
            if (msg.action === 'stop') saveFile(ws, pcmChunks);
        } catch {
            // ignore malformed text
        }
    });

    ws.on('close', () => {
        if (pcmChunks.length > 0) saveFile(null, pcmChunks);
        console.log('[save-audio] Client disconnected');
    });

    ws.on('error', (err) => {
        console.error('[save-audio] WebSocket error:', err.message);
    });
});

function saveFile(ws, pcmChunks) {
    if (pcmChunks.length === 0) {
        ws?.send(JSON.stringify({ error: 'No audio data received' }));
        return;
    }
    try {
        const pcmBuffer = Buffer.concat(pcmChunks);
        fs.writeFileSync(OUTPUT_FILE, pcmBuffer);
        console.log(`💾 Saved ${pcmBuffer.length} bytes → ${OUTPUT_FILE}`);
        ws?.send(JSON.stringify({ filename: 'recording.pcm', size: pcmBuffer.length }));
    } catch (err) {
        console.error('[save-audio] Failed to save:', err.message);
        ws?.send(JSON.stringify({ error: 'Failed to save audio file' }));
    }
}