import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import './config/db.js';
import './config/redis.js'; 
import sessionRoutes from './routes/sessionRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import userRoutes from './routes/userRoutes.js'; 
import { initSocket } from './socket/socketHandler.js';
import uploadRoutes from './routes/uploadRoutes.js';
import analyticsRoutes from "./routes/analyticsRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/api/users', userRoutes);

app.use('/api/sessions', sessionRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/upload', uploadRoutes); 
// Add this AFTER all your routes, before the listen call
app.use("/api/analytics", analyticsRoutes);
app.use((err, req, res, next) => {
  console.error('Global error:', err.message)
  res.status(400).json({ error: err.message })
})

app.get('/', (req, res) => {
  res.json({ message: 'AskAnon backend is running! 🚀' });
});

initSocket(io);
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export { io };
