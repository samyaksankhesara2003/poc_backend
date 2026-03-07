import { Router } from 'express';
import { pocController } from '../controllers/poc.controller.js';
import multer from 'multer';
const router = Router();

//for login user in our system
router.post('/login', pocController.loginController);
//for upload waiter audio
router.post('/upload', multer().single('audio'), pocController.uploadController);
//for upload conversation audio
router.post('/upload-conversation', multer().single('audio'), pocController.uploadConversationController);
//for get tables
router.get('/tables', pocController.getTablesController);
//for create session
router.post('/session', pocController.createSessionController);
//for get waiter audio sample
router.get('/audio-sample', pocController.getWaiterAudioController);


//for pinecone interaction
router.get('/pinecone/namespaces', pocController.getNamespacesController);
router.get('/pinecone/records', pocController.getRecordsController)
router.post('/pinecone/search', pocController.searchMenuController)
//for upload menu to pinecone self hosted model
router.post('/pinecone/upload-menu', pocController.uploadMenuController)
//for upload menu with OpenAI self embedding
router.post('/pinecone/upload-menu-embedding', pocController.uploadMenuWithEmbeddingController)
//for search menu with OpenAI self embedding
router.post('/pinecone/search-embedding', pocController.searchMenuWithEmbeddingController)
export default router;
