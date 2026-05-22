import express from 'express';
import {
  uploadQuestionImage,
  uploadSessionMedia,
  getSessionMedia,
  deleteMedia
} from '../controllers/uploadController.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();
router.post('/question', upload.single('image'), (req, res, next) => {
  console.log('Upload route hit')
  console.log('File:', req.file)
  next()
}, uploadQuestionImage)

// Student uploads image for their question
router.post('/question', upload.single('image'), uploadQuestionImage);

// Teacher shares image in session
router.post('/session/:sessionId/media', upload.single('image'), uploadSessionMedia);

// Get all media for a session
router.get('/session/:sessionId/media', getSessionMedia);

// Delete a media item
router.delete('/media/:publicId', deleteMedia);

export default router;