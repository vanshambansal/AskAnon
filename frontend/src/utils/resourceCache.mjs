// Memory only, bounded, and partitioned by verified account/role at the call site.
// No tokens or classroom data are persisted to browser storage.
const values = new Map();
const pending = new Map();
let generation = 0;
export const resourceVersion = () => generation;
export function invalidateResources() { generation++; values.clear(); }
export function peekResource(key) {
  const entry = values.get(key);
  if (!entry || entry.expires <= Date.now()) { values.delete(key); return null; }
  return entry.value;
}
export function readResource(key, load, { fresh = false, ttl = 30000 } = {}) {
  const cached = fresh ? null : peekResource(key);
  if (cached !== null) return Promise.resolve(cached);
  const version = generation;
  const jobKey = `${version}:${key}`;
  if (pending.has(jobKey)) return pending.get(jobKey);
  const work = Promise.resolve().then(load).then(value => {
    if (generation === version) {
      if (values.size >= 40) values.delete(values.keys().next().value);
      values.set(key, { value, expires: Date.now() + ttl });
    }
    return value;
  }).finally(() => pending.delete(jobKey));
  pending.set(jobKey, work);
  return work;
}
