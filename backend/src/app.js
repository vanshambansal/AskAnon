import { processDeletionJobs } from './utils/sessionDeletionJobs.js';
import { retryAssetCleanup } from './utils/storageLifecycle.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runtimeConfig, corsPolicy } from './config/runtime.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import redisClient from './config/redis.js';
import prisma from './config/prisma.js';
import { roleSwitchEnabled } from './middleware/authMiddleware.js';
import sessionRoutes from './routes/sessionRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { initSocket } from './socket/socketHandler.js';
import uploadRoutes from './routes/uploadRoutes.js';
import analyticsRoutes from "./routes/analyticsRoutes.js";
import materialRoutes from './routes/materialRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import bookmarkRoutes from './routes/bookmarkRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const config = runtimeConfig();
const httpServer = createServer(app);
const origins = corsPolicy(config.origins);
const io = new Server(httpServer, { cors: { ...origins, methods: ['GET', 'POST'] }, allowRequest(req, callback) { callback(null, !req.headers.origin || config.origins.includes(req.headers.origin)); } });
app.use(cors(origins));
app.use(express.json({ limit: '64kb' }));
app.disable('x-powered-by');
app.set('io', io);
app.use('/api/users', userRoutes);

app.use('/api/sessions', sessionRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err.name === 'MulterError' ? 400 : err.code?.startsWith('P1') ? 503 : 500);
  if (status >= 500) console.error('API request failed:', err.code || err.name);
  res.status(status).json({ error: status === 503 ? 'The database is temporarily unavailable. Please retry.' : status >= 500 ? 'The request could not be completed. Please retry.' : err.message });
});

app.get('/api/config', (req, res) => res.json({ role_switch_enabled: roleSwitchEnabled() }));
app.get('/health', async (req, res) => {
  try {
    await prisma.user.findFirst({ select: { id: true } });
    res.json({ api: 'ready', database: 'ready', redis: redisClient.isReady ? 'ready' : 'fallback' });
  } catch { res.status(503).json({ api: 'ready', database: 'unavailable', redis: redisClient.isReady ? 'ready' : 'fallback' }); }
});

app.get('/', (req, res) => {
  res.json({ message: 'AskAnon backend is running! 🚀' });
});

initSocket(io);
// This localhost server owns its indexing jobs. Interrupted jobs can be retried after restart.
prisma.courseMaterial.updateMany({ where: { index_status: { in: ['indexing', 'ocr'] } }, data: { index_status: 'failed', index_error: 'Indexing was interrupted by a server restart. Please retry.' } }).catch(() => console.warn('Could not recover interrupted indexing jobs'));
const deletionTimer = setInterval(() => processDeletionJobs(io).catch(() => console.warn('Lecture deletion worker unavailable')), 5000);
deletionTimer.unref();
processDeletionJobs(io).catch(() => console.warn('Lecture deletion worker will retry'));
const cleanupTimer = setInterval(() => retryAssetCleanup().catch(() => {}), 60000);
cleanupTimer.unref();
retryAssetCleanup().catch(() => {});
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(deletionTimer); clearInterval(cleanupTimer);
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  io.close(async () => {
    try { await prisma.$disconnect(); if (redisClient.isOpen) await redisClient.quit(); }
    finally { clearTimeout(deadline); process.exit(0); }
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
export { io };
