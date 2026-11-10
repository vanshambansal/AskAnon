import 'dotenv/config';

export function runtimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const configured = (env.ALLOWED_ORIGINS || env.FRONTEND_URL || '').split(',').map(value => value.trim()).filter(Boolean);
  const origins = [...new Set([...configured, ...(production ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])])];
  if (!origins.length) throw new Error('Set ALLOWED_ORIGINS to the frontend origin before starting production.');
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || (production && url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins; use HTTPS for public production domains.');
  }
  if (production) {
    const missing = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(key => !env[key]);
    if (missing.length) throw new Error('Missing required production configuration: ' + missing.join(', '));
  }
  return { production, origins };
}

export function corsPolicy(origins) {
  return { origin(origin, callback) {
    // CLI/health clients may have no Origin. Identity/resource guards still apply.
    if (!origin || origins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error('This frontend origin is not allowed.'), { status: 403 }));
  } };
}
