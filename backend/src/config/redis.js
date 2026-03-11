import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully!');
});

// Connect to Redis
await redisClient.connect();

export default redisClient;