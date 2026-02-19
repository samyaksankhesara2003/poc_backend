import { pocService } from '../services/poc.service.js';
import { enrollWaiterVoice } from '../services/waiterEnrollment.service.js';
import {
  enrollWaiterWithSpeechmatics,
  convertToPcm,
} from '../services/speechmaticsEnroll.service.js';
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
    await pocService.reDiarizSagmentService(req, res);
  } catch (error) {
    console.error('Upload controller error:', error);
    res.status(500).json({ error: "Transcription failed" });
  }
};

/** Waiter voice enrollment: save audio → extract speaker embedding → store in Pinecone */
const waiterEnrollmentController = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: "Audio file is required" });
    }
    const sessionId = req.body?.sessionId || null;
    const originalName = req.file.originalname || "waiter-recording.webm";
    const result = await enrollWaiterVoice(req.file.buffer, sessionId, originalName);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(200).json({
      success: true,
      message: "Waiter voice print stored in Pinecone",
      waiterId: result.waiterId,
      filename: result.filename,
    });
  } catch (error) {
    console.error("Waiter enrollment error:", error);
    res.status(500).json({ success: false, error: error?.message || "Enrollment failed" });
  }
};

/** Speechmatics-only enrollment: get speaker_identifiers for use in real-time speaker identification */
const speechmaticsEnrollController = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: "Audio file is required" });
    }
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    const tempPath = path.join(uploadsDir, `enroll-${Date.now()}.webm`);
    fs.writeFileSync(tempPath, req.file.buffer);
    try {
      const pcmBuffer = await convertToPcm(tempPath);
      if (!pcmBuffer || pcmBuffer.length < 16000 * 2 * 3) {
        return res.status(400).json({
          success: false,
          error: "Audio too short. Record at least 3 seconds for enrollment.",
        });
      }
      const result = await enrollWaiterWithSpeechmatics(pcmBuffer);
      return res.status(200).json({
        success: true,
        speaker_identifiers: result.speaker_identifiers,
        label: result.label,
      });
    } finally {
      // if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  } catch (error) {
    console.error("Speechmatics enrollment error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Enrollment failed",
    });
  }
};

export const pocController = {
  testController,
  uploadController,
  analyseChat,
  reDiarizSagment,
  waiterEnrollmentController,
  speechmaticsEnrollController,
};