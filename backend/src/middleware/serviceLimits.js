import redis from '../config/redis.js';

const buckets = new Map();
const active = new Map();
let total = 0;
const increment = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";

export function serviceLimit(name, limit, windowMs, concurrency = 0) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to continue' });
    const key = `service-limit:${name}:${req.user.id}`, now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expires <= now) bucket = { count: 0, expires: now + windowMs };
    if (bucket.count >= limit) return limited(res, Math.ceil((bucket.expires - now) / 1000));
    if (concurrency && ((active.get(key) || 0) >= concurrency || total >= 8)) return res.status(503).json({ error: 'The service is busy. Please wait for the current task and retry.', code: 'SERVICE_BUSY' });
    if (buckets.size >= 10000 && !buckets.has(key)) {
      for (const [id, value] of buckets) if (value.expires <= now) buckets.delete(id);
      if (buckets.size >= 10000) return res.status(503).json({ error: 'The service is busy. Please retry shortly.' });
    }
    // Reserve before awaiting Redis: overlapping requests cannot pass the same slot.
    bucket.count++;
    buckets.set(key, bucket);
    let release = () => {};
    if (concurrency) {
      active.set(key, (active.get(key) || 0) + 1); total++;
      let released = false;
      release = () => { if (released) return; released = true; const value = (active.get(key) || 1) - 1; if (value) active.set(key, value); else active.delete(key); total--; };
      res.once('finish', release); res.once('close', release);
    }
    try { if (redis.isReady) bucket.count = Math.max(bucket.count, Number(await redis.eval(increment, { keys: [key], arguments: [String(windowMs)] }))); } catch { /* Single-server fallback remains available. */ }
    if (bucket.count > limit) { release(); return limited(res, Math.ceil((bucket.expires - now) / 1000)); }
    next();
  };
}
function limited(res, seconds) { res.setHeader('Retry-After', String(Math.max(1, seconds))); return res.status(429).json({ error: 'Your usage limit for this feature has been reached. Please retry later.', code: 'APP_USAGE_LIMIT', retry_after: Math.max(1, seconds) }); }
export const aiLimit = serviceLimit('ai', 20, 3600000, 2);
export const uploadLimit = serviceLimit('upload', 20, 3600000, 2);
export const indexLimit = serviceLimit('index', 6, 3600000);
export const duplicateLimit = serviceLimit('duplicate', 60, 60000);
