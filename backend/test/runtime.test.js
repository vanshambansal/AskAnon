import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
process.env.REDIS_URL = '';
const { runtimeConfig, corsPolicy } = await import('../src/config/runtime.js');
const { serviceLimit } = await import('../src/middleware/serviceLimits.js');

test('production requires explicit origins and credentials; origin matches are exact', () => {
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production' }), /ALLOWED_ORIGINS/);
  assert.throws(() => runtimeConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example' }), /Missing required/);
  assert.throws(() => runtimeConfig({ ALLOWED_ORIGINS: 'https://app.example/path' }));
  const policy = corsPolicy(['https://app.example']);
  policy.origin('https://app.example', (err, allowed) => { assert.equal(err, null); assert.equal(allowed, true); });
  policy.origin('https://app.example.evil', err => assert.equal(err.status, 403));
});

test('service budgets use local fallback, enforce concurrency and release only once', async () => {
  const limiter = serviceLimit('fixture', 2, 60000, 1);
  const req = { user: { id: 700000 } };
  const response = () => Object.assign(new EventEmitter(), { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
  let accepted = 0;
  const first = response(); await limiter(req, first, () => accepted++);
  const concurrent = response(); await limiter(req, concurrent, () => accepted++);
  assert.equal(concurrent.statusCode, 503);
  first.emit('finish'); first.emit('close');
  const second = response(); await limiter(req, second, () => accepted++); second.emit('finish');
  const exceeded = response(); await limiter(req, exceeded, () => accepted++);
  assert.equal(accepted, 2); assert.equal(exceeded.statusCode, 429);
  assert.equal(exceeded.body.code, 'APP_USAGE_LIMIT');
});
