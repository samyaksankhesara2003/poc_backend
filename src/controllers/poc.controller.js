import { pocService } from '../services/poc.service.js';
import dotenv from "dotenv";
dotenv.config();

const loginController = async (req, res) => {
  try {
    const data = await pocService.loginService(req.body);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const uploadController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }
    const { username, email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const result = await pocService.uploadWaiterAudio(req.file, {
      username: username || '',
      email,
    });
    res.json(result);
  } catch (error) {
    console.error('Upload controller error:', error);
    const message = error.message || 'Upload failed';
    const status = message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: message });
  }
};

const getTablesController = async (req, res) => {
  try {
    const data = await pocService.getTablesService();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const createSessionController = async (req, res) => {
  try {
    const data = await pocService.createSessionService(req.body);
    res.status(200).json(data);
  } catch (error) {
    console.error('createSessionController error:', error);
    res.status(500).json({
      error: error.message || 'Internal Server Error',
    });
  }
}
export const pocController = {
  loginController,
  uploadController,
  getTablesController,
  createSessionController
}