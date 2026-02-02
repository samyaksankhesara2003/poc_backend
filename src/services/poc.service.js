import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import dotenv from "dotenv";
dotenv.config();

import { Pinecone } from "@pinecone-database/pinecone";
const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const namespace = pc.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST).namespace(process.env.PINECONE_NAMESPACE);

const execAsync = promisify(exec);

const testService = async () => {
    return { message: 'Test endpoint is working!' };
}

const transcribeAudio = async (audioPath) => {
    const outputDir = "outputs";
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // Check if file is already WAV format
    const isWav = path.extname(audioPath).toLowerCase() === '.wav';
    let wavPath = audioPath;

    // Only convert if not already WAV
    if (!isWav) {
        wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
        const convertCommand = `ffmpeg -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`;
        
        try {
            await execAsync(convertCommand);
            console.log('Audio converted successfully');
        } catch (error) {
            console.error('FFmpeg conversion error:', error);
            throw new Error('Audio conversion failed');
        }
    }

    const fileName = path.basename(wavPath, path.extname(wavPath));
    const txtPath = path.join(outputDir, `${fileName}.txt`);

    const command = `/home/techuz/.local/bin/whisper "${wavPath}" --model small --language en --output_format txt --output_dir ${outputDir}`;
    
    try {
        const { stdout, stderr } = await execAsync(command);
        console.log('Whisper transcription completed');
    } catch (error) {
        console.error('Whisper execution error:', error);
        throw new Error('Whisper transcription failed');
    }

    if (!fs.existsSync(txtPath)) {
        throw new Error(`Whisper output not found: ${txtPath}`);
    }

    const text = fs.readFileSync(txtPath, "utf8");

    // No cleanup - keep all files
    console.log('Files saved:');
    console.log('- Original audio:', audioPath);
    if (!isWav) console.log('- Converted WAV:', wavPath);
    console.log('- Transcription:', txtPath);

    return text.trim();
};
export const pocService = {
    testService,
    transcribeAudio
}