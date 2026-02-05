import { pocService } from '../services/poc.service.js';
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import OpenAI from 'openai';
dotenv.config();


// const openAi = new OpenAI({})
const testController = async (req, res) => {
  try {
    const data = await pocService.testService();
    res.status(200).json(data);
  }
  catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const uploadController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio file is required" });
    }

    const uploadsDir = "uploads";
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

    const audioPath = path.join(
      uploadsDir,
      `${Date.now()}-${req.file.originalname}`
    );

    fs.writeFileSync(audioPath, req.file.buffer);

    const text = await pocService.transcribeAudio(audioPath);

    console.log('Transcription result:', text);

    res.json({ success: true, text });
  } catch (error) {
    console.error('Upload controller error:', error);
    res.status(500).json({ error: "Transcription failed" });
  }
};

const analyseChat = async (req, res) => {
  try {
    const { text } = req.body
    const data = await pocService.analyseChatService(text)
    console.log(data);

    res.json({ success: true, data })
  } catch (error) {
    console.error('Upload controller error:', error);
    res.status(500).json({ error: "Transcription failed" });
  }
}

const reDiarizSagment = async (req, res) => {
  try {
    

    // const data = 
    await pocService.reDiarizSagmentService(req,res)

    // res.json({ success: true, data })
  } catch (error) {
    console.error('Upload controller error:', error);
    res.status(500).json({ error: "Transcription failed" });
  }
}

export const pocController = {
  testController,
  uploadController,
  analyseChat,
  reDiarizSagment
}