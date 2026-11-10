import { createClient } from 'redis';
import 'dotenv/config';

const redisClient = createClient({
  url: process.env.REDIS_URL,
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: retries => Math.min(500 * 2 ** Math.min(retries, 5), 15000) + Math.floor(Math.random() * 250)
  }
});
let outageReported = false;
redisClient.on('error', () => { if (!outageReported) console.warn('Redis unavailable; using single-server memory fallback'); outageReported = true; });
redisClient.on('ready', () => { outageReported = false; console.info('Redis ready'); });
// Optional service: retries must not hold HTTP startup behind top-level await.
if (process.env.REDIS_URL) {
  redisClient.connect().catch(() => console.warn('Redis unavailable; using local fallback'));
}
export default redisClient;
