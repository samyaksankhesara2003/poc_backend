import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import dotenv from "dotenv";
import OpenAI from "openai";
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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const analyseChatService = async (text) => {
    try {

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "Analyze the following conversation and return JSON with tone, sentiment, intent, emotion, summary"
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('error in getting text')
    }
}

const reDiarizSagmentService = async (req, res) => {
    try {
        const { segment, context = [] } = req.body;

        const recentContext = context
            .map(s => `${s.speaker}: ${s.text}`)
            .join('\n');

        // -- first poc prompt 1st

        const prompt = `You are analyzing a restaurant conversation between WAITER and CUSTOMER.

        RECENT CONVERSATION:
        ${recentContext || "No previous context"}

        NEW SEGMENT:
        "${segment.text}"

        TASK: Determine who said this.

        RULES:
        - Waiters: greet, take orders, offer suggestions, serve
        - Customers: order, ask questions, make requests

        Respond with ONLY one word: "waiter" or "customer"`;


        //-- second poc prompt 2nd
        console.log(recentContext,"sam");

        // const prompt = `You are a restaurant conversation analyst with 99% accuracy.

        //                 CONVERSATION SO FAR:
        //                 ${recentContext || "⚠️ FIRST UTTERANCE - Likely waiter greeting"}

        //                 CURRENT SEGMENT:
        //                 "${segment.text}"

        //                 DECISION TREE:

        //                 CHECK STRONG KEYWORDS:
        //                 Waiter: "welcome", "recommend", "special", "I'll get", "how is everything"
        //                 Customer: "I'll have", "can I get", menu item names, "check please"

        //                 ANALYZE SENTENCE STRUCTURE:
        //                 Waiter: Questions (offering), statements (informing), confirmations
        //                 Customer: Requests (ordering), questions (asking), preferences (modifying)

        //                 EXAMINE CONTEXT FLOW:
        //                 - What was the previous speaker likely to say?
        //                 - What response makes logical sense?
        //                 - Who typically speaks in this sequence?

        //                 SPECIAL CASES:
        //                 "Thank you" → Check who's receiving (customer) vs providing (waiter)
        //                 "Okay/Sure/Yes" → Follow conversation flow
        //                 Food names alone → Customer ordering
        //                 First utterance → 95% waiter

        //                 COMMON WAITER PHRASES:
        //                 "Can I get you started", "I'll be right back", "Let me check", "That comes with", 
        //                 "Anything to drink", "Room for", "I'll grab", "How are we doing"

        //                 COMMON CUSTOMER PHRASES:  
        //                 "I'll do the", "Can we have", "What's in", "How spicy", "No [ingredient]",
        //                 "To go please", "Can you split", "We're ready to order"

        //                 ⚡ OUTPUT ONLY: "waiter" or "customer" (nothing else)`;


        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a conversation analyst. Respond with only 'waiter' or 'customer'."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 10,
            temperature: 0.3,
        });

        const role = response.choices[0].message.content.trim().toLowerCase();

        res.json({
            corrected: {
                speaker: role === "waiter" ? "waiter" : "customer",
                text: segment.text,
                originalSpeaker: segment.speaker,
                confidence: "ai_corrected"
            }
        });
        // const x = req.body
        // return x;
    } catch (error) {
        console.error('error in catch', error)
    }
}
export const pocService = {
    testService,
    transcribeAudio,
    analyseChatService,
    reDiarizSagmentService
}