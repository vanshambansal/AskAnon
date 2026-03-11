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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server from Express app
// Socket.io needs a raw HTTP server, not just Express
const httpServer = createServer(app);

// Attach Socket.io to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for now (we'll restrict later)
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/api/users', userRoutes);

app.use('/api/sessions', sessionRoutes);
app.use('/api/questions', questionRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'AskAnon backend is running! 🚀' });
});

// Initialize all socket event handlers
initSocket(io);

// Use httpServer instead of app to listen
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export { io }; // Export so controllers can use it later
