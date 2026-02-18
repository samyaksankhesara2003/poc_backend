import { Router } from 'express';
import { pocController } from '../controllers/poc.controller.js';
import multer from 'multer';
const router = Router();
// const upload = multer({ storage: multer.memoryStorage() });

router.get('/test', pocController.testController);

// router.post("/upload", upload.single("audio"), pocController.uploadController);

router.post('/upload', multer().single('audio'), pocController.uploadController);

router.post('/waiter-enrollment', multer({ storage: multer.memoryStorage() }).single('audio'), pocController.waiterEnrollmentController);

router.post('/analysis', pocController.analyseChat)

router.post('/rediarize-segment', pocController.reDiarizSagment)
export default router;
