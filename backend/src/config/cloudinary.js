import { courseAccess, sessionAccess, fail } from '../middleware/accessMiddleware.js';
import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryStorage } from '../utils/cloudinaryStorage.js';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

// Configure cloudinary credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage engine for images (questions and diagrams)
const imageStorage = cloudinaryStorage(cloudinary, {
    folder: 'askanon/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, crop: 'limit' }],
});

export const upload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only JPG, PNG, GIF, and WEBP image formats allowed'), { status: 400 }), false);
    }
  }
});

// Storage engine for study materials (Lecture slides, PDFs, problem sheets up to 25MB)
const materialStorage = cloudinaryStorage(cloudinary, async (req, file) => {
    if (!req.body.title?.trim()) fail(400, 'Enter a material title before selecting the file');
    if (req.body.course_id) await courseAccess(req.user, req.body.course_id, true);
    if (req.body.session_id) {
      const session = await sessionAccess(req.user, req.body.session_id, { write: true });
      if (req.body.course_id && session.course_id && Number(req.body.course_id) !== session.course_id) fail(400, 'The selected course does not match this lecture');
    } else if (!req.body.course_id) fail(400, 'A course or lecture is required');
    const isPdf = file.mimetype === 'application/pdf';
    return {
      folder: 'askanon/materials',
      resource_type: isPdf ? 'raw' : 'auto',
      public_id: `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    };
});

export const materialUpload = multer({
  storage: materialStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max for slide decks and PDFs
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only PDF and image materials allowed'), { status: 400 }), false);
    }
  }
});

export { cloudinary };
export default cloudinary;
