import { Router } from 'express';
import { pocController } from '../controllers/poc.controller.js';
import multer from 'multer';
const router = Router();

router.post('/login', pocController.loginController);
router.post('/upload', multer().single('audio'), pocController.uploadController);
router.post('/upload-conversation', multer().single('audio'), pocController.uploadConversationController);
router.get('/tables', pocController.getTablesController);
router.post('/session', pocController.createSessionController);
router.post('/save-analysis', pocController.saveAnalysisController);
router.get('/analysis/:unique_session_id', pocController.getAnalysisController);
export default router;
