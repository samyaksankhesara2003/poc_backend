import { pocService } from '../services/poc.service.js';
import { pineconeService } from '../services/pinecone.service.js';
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

const uploadConversationController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }
    const unique_session_id = req.body?.unique_session_id;
    if (!unique_session_id) {
      return res.status(400).json({ error: 'unique_session_id is required' });
    }
    const data = await pocService.uploadConversationAudio(req.file, unique_session_id);
    res.status(200).json(data);
  } catch (error) {
    console.error('uploadConversationController error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
};

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
};

const getWaiterAudioController = async (req, res) => {
  try {
    const { audio_path } = req.query;
    if (!audio_path) {
      return res.status(400).json({ error: 'audio_path is required' });
    }

    const stream = await pocService.getWaiterAudioStream(audio_path);
    const ext = audio_path.toLowerCase().split('.').pop();
    const mimeMap = { wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');

    stream.on('error', (err) => {
      console.error('getWaiterAudioController stream error:', err);
      if (!res.headersSent) {
        res.status(500).end('Error streaming audio');
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('getWaiterAudioController error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
};

const getNamespacesController = async (req, res) => {
  try {
    const data = await pineconeService.getNamespacesService();
    res.status(200).json(data);
  } catch (error) {
    console.error('getNamespacesController error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

const getRecordsController = async (req, res) => {
  try {
    const { query } = req
    const data = await pineconeService.getRecordsService(query);
    res.status(200).json(data);
  } catch (error) {
    console.error('getRecordsController error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

const searchMenuController = async (req, res) => {
  try {
    const { body } = req
    const data = await pineconeService.searchMenuService(body)
    res.status(200).json(data);

  } catch (error) {
    console.error('getRecordsController error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

const uploadMenuController = async (req, res) => {
  try {
    const data = await pineconeService.uploadMenuService();
    res.status(200).json(data);
  } catch (error) {
    console.error('uploadMenuController error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload menu' });
  }
};

const uploadMenuWithEmbeddingController = async (req, res) => {
  try {
    const data = await pineconeService.uploadMenuWithEmbeddingService();
    res.status(200).json(data);
  } catch (error) {
    console.error('uploadMenuWithEmbeddingController error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload menu with embeddings' });
  }
};

const searchMenuWithEmbeddingController = async (req, res) => {
  try {
    const { body } = req;
    if (!body?.query) {
      return res.status(400).json({ error: 'query is required' });
    }
    const data = await pineconeService.searchMenuWithEmbeddingService(body);
    res.status(200).json(data);
  } catch (error) {
    console.error('searchMenuWithEmbeddingController error:', error);
    res.status(500).json({ error: error.message || 'Failed to search menu' });
  }
};

export const pocController = {
  loginController,
  uploadController,
  uploadConversationController,
  getTablesController,
  createSessionController,
  getWaiterAudioController,
  getNamespacesController,
  getRecordsController,
  searchMenuController,
  uploadMenuController,
  uploadMenuWithEmbeddingController,
  searchMenuWithEmbeddingController
};