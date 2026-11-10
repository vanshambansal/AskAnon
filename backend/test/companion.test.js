import { test, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.REDIS_URL = '';
process.env.GEMINI_API_KEY = 'isolated-companion-fixture';
const { normalizeVaultHistory, vaultSearchQuery, expandRetrievedContext, answerFromChunks } = await import('../src/utils/ragService.js');
const prisma = (await import('../src/config/prisma.js')).default;
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test('conversation context is bounded and follow-up retrieval retains the topic', () => {
  const history = normalizeVaultHistory([{ question: 'How does paging work?', answer: 'Memory is divided into fixed-size pages.' }]);
  assert.match(vaultSearchQuery('Explain that more simply.', history), /paging/);
  assert.equal(vaultSearchQuery('A new question', []), 'A new question');
  for (const invalid of [{}, Array(4).fill(history[0]), [{ question: 'topic', answer: 'x'.repeat(6001) }], [{ question: '', answer: 'text' }]]) assert.throws(() => normalizeVaultHistory(invalid), error => error.status === 400);
});

test('neighbor expansion keeps citations, deduplicates and stays inside authorized material IDs', async () => {
  const original = prisma.materialChunk.findMany;
  let where;
  prisma.materialChunk.findMany = async args => {
    where = args.where;
    return [{ id: 'a', material_id: 1, chunk_index: 0, page_number: 1, chunk_text: 'Definition' }, { id: 'b', material_id: 1, chunk_index: 1, page_number: 2, chunk_text: 'Explanation' }, { id: 'private', material_id: 99, chunk_index: 1, chunk_text: 'PRIVATE' }];
  };
  try {
    const seeds = [{ id: 'b', material_id: 1, chunk_index: 1, page_number: 2, chunk_text: 'Explanation' }, { id: 'private', material_id: 99, chunk_index: 1 }];
    const chunks = await expandRetrievedContext(seeds, [{ id: 1, title: 'Memory', category: 'Notes' }], 2);
    assert.equal(chunks.length, 2);
    assert.deepEqual(new Set(chunks.map(chunk => chunk.id)), new Set(['a', 'b']));
    assert.ok(where.OR.every(range => range.material_id === 1));
    assert.equal(chunks[0].page_number, 2);
    assert.ok(chunks.every(chunk => chunk.material_title === 'Memory'));
  } finally { prisma.materialChunk.findMany = original; }
});

test('structured companion output preserves practice answers separately and prior answers are context only', async () => {
  let body;
  const practice = [1, 2, 3].map(number => ({ question: `Question ${number}?`, answer: `Worked answer ${number} [Source 1].` }));
  globalThis.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'Try these questions before revealing the answers.', followUps: ['How does this apply?'], practice }) }] } }] }) };
  };
  const result = await answerFromChunks('Check my understanding', [{ id: 'a', material_id: 1, material_title: 'Memory', chunk_text: 'Paging uses fixed-size pages.', page_number: 3 }], 'Systems', 'practice', [{ question: 'Explain paging', answer: 'Previous context' }]);
  assert.equal(result.practice.length, 3);
  assert.equal(result.followUps.length, 1);
  assert.doesNotMatch(result.answer, /Worked answer/);
  assert.equal(result.evidence[0].page, 3);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 6000);
  assert.match(body.contents[0].parts[0].text, /not evidence/);
  assert.match(body.contents[0].parts[0].text, /Previous context/);
  globalThis.fetch = async () => { throw new Error('no evidence must skip generation'); };
  assert.equal((await answerFromChunks('Unsupported', [], 'Systems')).contextCount, 0);
});

test('malformed structured output stays a retryable error with evidence available', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":"unfinished"}' }] } }] }) });
  await assert.rejects(answerFromChunks('Explain', [{ material_id: 1, material_title: 'Notes', chunk_text: 'Academic evidence', page_number: 1 }], 'Systems'), error => error.status === 503 && error.evidence.length === 1);
});
