import { Router } from 'express';
import { pocController } from '../controllers/poc.controller.js';
import multer from 'multer';
const router = Router();

router.post('/login', pocController.loginController);
router.post('/upload', multer().single('audio'), pocController.uploadController);
router.get('/tables', pocController.getTablesController);
router.post('/session', pocController.createSessionController);
export default router;
