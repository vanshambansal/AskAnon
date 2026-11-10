import assert from 'node:assert/strict';
import { test, after } from 'node:test';
process.env.REDIS_URL = '';
process.env.GEMINI_API_KEY = 'isolated-provider-fixture';
const { generateText, generateTextWithFallback } = await import('../src/utils/geminiClient.js');
const { generateLectureInsights } = await import('../src/utils/aiInsightsService.js');
const { checkAIModeration, checkLocalProfanity } = await import('../src/utils/contentModerator.js');
const { chunkText, generateEmbedding } = await import('../src/utils/ragService.js');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const reply = text => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }) });

test('provider failures and truncated output reject rather than return an answer; no repeated calls', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 429 }; };
  await assert.rejects(generateText('fixture'), /usage limit/);
  assert.equal(calls, 1);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }) });
  await assert.rejects(generateText('fixture'), /complete response/);
});

test('vault overload uses one bounded fallback; quota is never retried', async () => {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return calls.length === 1 ? { ok: false, status: 503, json: async () => ({}) } : reply('Grounded answer [Source 1]');
  };
  assert.equal(await generateTextWithFallback('fixture', { model: 'gemini-primary-fixture' }), 'Grounded answer [Source 1]');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /gemini-primary-fixture/);
  assert.match(calls[1], /gemini-3.5-flash-lite/);
  calls.length = 0;
  globalThis.fetch = async () => { calls.push('quota'); return { ok: false, status: 429 }; };
  await assert.rejects(generateTextWithFallback('fixture'), { code: 'AI_RATE_LIMIT' });
  assert.equal(calls.length, 1);
});

test('retrieved passages stay inspectable on generation overload without inventing an answer', async () => {
  const { answerFromChunks } = await import('../src/utils/ragService.js');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 503, json: async () => ({}) }; };
  await assert.rejects(answerFromChunks('Explain paging', [{ material_id: 123, material_title: 'OS', page_number: 7, chunk_text: 'Paging divides memory into fixed-size pages.' }], 'Systems'), error => {
    assert.equal(error.code, 'AI_OVERLOADED');
    assert.equal(error.evidence[0].page, 7);
    assert.equal(error.evidence[0].text, 'Paging divides memory into fixed-size pages.');
    assert.equal(error.sources[0].id, 123);
    assert.equal(error.answer, undefined);
    return true;
  });
  assert.equal(calls, 2);
});

test('empty or quarantined discussion does not fabricate a recap or call the provider', async () => {
  globalThis.fetch = async () => { throw new Error('must not run'); };
  const result = await generateLectureInsights({ title: 'QA' }, [{ status: 'FLAGGED', question_text: 'spam' }]);
  assert.equal(result.status, 'empty');
  assert.deepEqual(result.core_concepts, []);
});

test('recaps include code and actual answers, exclude quarantined content, and validate every field', async () => {
  let prompt;
  const valid = { core_concepts: ['Binary search'], student_misconceptions: 'A student asked about sorted input.', exam_revision_note: 'Review sorted input requirements.', action_for_next_lecture: 'Demonstrate sorted input.' };
  globalThis.fetch = async (url, options) => { prompt = JSON.parse(options.body).contents[0].parts[0].text; return reply(JSON.stringify(valid)); };
  const result = await generateLectureInsights({ title: 'Search' }, [{ question_text: 'Why sorted?', code_snippet: 'binarySearch(items)', answer_text: 'It eliminates half the range.' }, { status: 'DISMISSED', question_text: 'HIDDEN_SPAM' }]);
  assert.equal(result.version, 2);
  assert.match(prompt, /binarySearch/);
  assert.match(prompt, /eliminates half/);
  assert.doesNotMatch(prompt, /HIDDEN_SPAM/);
  globalThis.fetch = async () => reply('{"core_concepts":["Search"]}');
  await assert.rejects(generateLectureInsights({ title: 'Search' }, [{ question_text: 'Why?' }]), /incomplete recap/);
});

test('moderation cache includes lecture context, and failures are never cached as reviewed', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return reply('{"isSafe":true}'); };
  const text = `Can you explain branching? ${Date.now()}`;
  await checkAIModeration(text, 'Version control');
  await checkAIModeration(text, 'Botany');
  assert.equal(calls, 2);
  globalThis.fetch = async () => { calls++; throw new Error('offline'); };
  const failed = await checkAIModeration('retry fixture', 'Math');
  assert.equal(failed.reviewed, false);
  assert.equal(failed.isSafe, false);
  assert.match(failed.reason, /unavailable/);
  assert.equal((await checkAIModeration('retry fixture', 'Math')).reviewed, false);
  assert.equal(calls, 4);
  assert.equal(checkLocalProfanity('How does a dumb terminal differ from a smart terminal?').isSafe, true);
  assert.equal(checkLocalProfanity('What is MC sampling?').isSafe, true);
});

test('polite greetings are off-topic without blocking academic questions containing the same words', async () => {
  const greeting = await checkAIModeration('How are you?', 'CPU', 'Computer architecture');
  assert.equal(greeting.isSafe, false);
  assert.equal(greeting.category, 'off_topic');
  globalThis.fetch = async () => reply('{"isSafe":true,"category":"safe"}');
  const academic = await checkAIModeration('How are you implementing instruction pipelining?', 'CPU', 'Computer architecture');
  assert.equal(academic.isSafe, true);
});

test('long paragraphs are bounded without losing text; malformed vectors are rejected', async () => {
  const text = 'academic paragraph '.repeat(600);
  const chunks = chunkText(text, 1200);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(c => c.length <= 1200));
  assert.equal(chunks.join(' '), text.trim());
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ embedding: { values: [1, 2] } }) });
  await assert.rejects(generateEmbedding('fixture'));
});

test('failed PDF reindex shares a job, preserves existing chunks and persists a retryable status', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { processAndEmbedMaterial } = await import('../src/utils/ragService.js');
  const original = { find: prisma.courseMaterial.findUnique, update: prisma.courseMaterial.update, many: prisma.courseMaterial.updateMany, course: prisma.course.findUnique, transaction: prisma.$transaction };
  const states = []; let transactions = 0;
  prisma.courseMaterial.findUnique = async () => ({ id: 901, course_id: 900, file_type: 'pdf', file_url: 'https://example.invalid/fixture.pdf', indexed_at: new Date() });
  prisma.courseMaterial.update = async args => { states.push(args.data); return args.data; };
  prisma.courseMaterial.updateMany = async args => { states.push(args.data); return { count: 1 }; };
  prisma.course.findUnique = async () => null;
  prisma.$transaction = async () => { transactions++; };
  globalThis.fetch = async () => { throw new Error('storage offline'); };
  try {
    const first = processAndEmbedMaterial(901);
    const second = processAndEmbedMaterial(901);
    assert.equal(first, second);
    await assert.rejects(first);
    assert.equal(transactions, 0, 'existing index must not be touched before all replacement embeddings exist');
    assert.deepEqual(states.map(s => s.index_status), ['indexing', 'failed']);
    assert.ok(states[1].index_error);
  } finally {
    prisma.courseMaterial.findUnique = original.find; prisma.courseMaterial.update = original.update; prisma.courseMaterial.updateMany = original.many; prisma.course.findUnique = original.course; prisma.$transaction = original.transaction;
  }
});

test('concurrent recap readers share generation and a failed refresh never overwrites a valid recap', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { lectureInsights } = await import('../src/utils/lectureInsights.js');
  const original = { q: prisma.question.findMany, p: prisma.poll.findMany, update: prisma.session.update };
  let calls = 0, writes = 0;
  prisma.question.findMany = async () => [{ question_text: 'Why sorted?', answer_text: 'So each comparison eliminates a half.' }];
  prisma.poll.findMany = async () => [];
  prisma.session.update = async () => { writes++; };
  globalThis.fetch = async () => { calls++; throw new Error('provider offline'); };
  const session = { id: 999, session_code: 'QA9999', teacher_id: 999, ai_summary: { version: 2, status: 'ready' } };
  try {
    const a = lectureInsights(session, true), b = lectureInsights(session, true);
    assert.equal(a, b);
    await assert.rejects(a);
    assert.equal(calls, 1);
    assert.equal(writes, 0);
    assert.equal(await lectureInsights(session), session.ai_summary);
  } finally { prisma.question.findMany = original.q; prisma.poll.findMany = original.p; prisma.session.update = original.update; }
});

test('duplicate detection retains exact matching without AI and distinguishes semantic candidates', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { checkDuplicateQuestion } = await import('../src/controllers/questionController.js');
  const { findSimilarQuestion, getEmbedding } = await import('../src/utils/embeddingService.js');
  const original = prisma.question.findMany;
  prisma.question.findMany = async () => [{ id: 1, question_text: 'Why is sorted input required?', upvotes: 3 }];
  let result;
  globalThis.fetch = async () => { throw Error('offline'); };
  try {
    await checkDuplicateQuestion({ body: { session_id: 1, question_text: ' WHY is sorted input required?! ' } }, { json: data => { result = data; } });
    assert.equal(result.hasDuplicate, true);
    assert.equal(result.matchedQuestion.id, 1);
    const candidates = [{ id: 2, question_text: 'fixture sorted search comparison' }, { id: 3, question_text: 'fixture database transaction isolation' }];
    globalThis.fetch = async (url, options) => {
      const text = JSON.parse(options.body).content.parts[0].text;
      return { ok: true, json: async () => ({ embedding: { values: (text.includes('transaction') ? [0, 1, 0] : [1, 0.05, 0]).concat(Array(765).fill(0)) } }) };
    };
    await Promise.all(candidates.map(q => getEmbedding(q.question_text)));
    const match = await findSimilarQuestion('fixture why does binary search require sorting', candidates);
    assert.equal(match.hasDuplicate, true);
    assert.equal(match.matchedQuestion.id, 2);
    const unrelated = await findSimilarQuestion('fixture why does binary search require sorting', [candidates[1]]);
    assert.equal(unrelated.hasDuplicate, false);
    globalThis.fetch = async () => { throw Error('provider offline'); };
    const unavailable = await findSimilarQuestion('fixture unique uncached provider outage question', candidates);
    assert.equal(unavailable.hasDuplicate, false);
  } finally { prisma.question.findMany = original; }
});


test('daily AI quota errors preserve actionable status and retry metadata', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, headers: new Headers(), json: async () => ({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { retryDelay: '3600s' }] } }) });
  await assert.rejects(generateText('quota fixture'), error => error.status === 429 && error.code === 'AI_DAILY_QUOTA' && error.retryAfter === 3600 && error.message.includes('daily quota'));
});

test('concurrent overview requests reuse one grounded generation and include source pages', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { askCourseRag } = await import('../src/utils/ragService.js');
  const original = { course: prisma.course.findUnique, chunks: prisma.materialChunk.findMany };
  const course = { id: 904, title: 'Transactions fixture', materials: [{ id: 905, title: 'Transactions', category: 'Notes', file_type: 'pdf', indexed_at: new Date(), _count: { chunks: 3 } }] };
  prisma.course.findUnique = async () => course;
  prisma.materialChunk.findMany = async () => [1, 2, 3].map(page => ({ id: String(page), material_id: 905, chunk_index: page - 1, page_number: page, chunk_text: page === 3 ? 'Write-ahead logging supports recovery.' : 'Atomic transactions commit or roll back.' }));
  let calls = 0, prompt;
  globalThis.fetch = async (url, options) => { calls++; prompt = JSON.parse(options.body).contents[0].parts[0].text; return reply(JSON.stringify({ answer: 'Atomicity and recovery [Source 1].', followUps: ['How does logging support recovery?'], practice: [] })); };
  try {
    const answers = await Promise.all([askCourseRag(904, 'Overview fixture', 'overview'), askCourseRag(904, 'Overview fixture', 'overview')]);
    assert.equal(calls, 1);
    assert.deepEqual(answers[0].sources[0].pages, [1, 2, 3]);
    assert.match(prompt, /selected excerpts/);
    assert.match(prompt, /Write-ahead logging/);
    course.materials[0].indexed_at = new Date(Date.now() + 5000);
    await (await import('../src/utils/cacheHelper.js')).invalidateCache('cache:rag:manifest:904');
    await askCourseRag(904, 'Overview fixture', 'overview');
    assert.equal(calls, 2, 'reindexing must invalidate the generated-answer fingerprint');
  } finally { prisma.course.findUnique = original.course; prisma.materialChunk.findMany = original.chunks; }
});

test('off-topic submissions return a reason without persisting or broadcasting', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { createQuestion } = await import('../src/controllers/questionController.js');
  const original = prisma.$transaction;
  let writes = 0, status, body, error;
  prisma.$transaction = async () => { writes++; throw new Error('must not persist rejected text'); };
  globalThis.fetch = async () => reply('{"isSafe":false,"category":"off_topic","reason":"Not related to algorithms."}');
  try {
    await createQuestion({ body: { session_id: 910, question_text: 'Which football team will win tonight? rejection fixture' }, user: { id: 913 }, classroom: { title: 'Algorithms', subject: 'Binary search' } }, { locals: {}, status(code) { status = code; return this; }, json(data) { body = data; } }, err => { error = err; });
    assert.equal(error, undefined);
    assert.equal(status, 422);
    assert.match(body.error, /Not related/);
    assert.equal(writes, 0);
  } finally { prisma.$transaction = original; }
});

test('provider outage returns a retryable error without persisting unchecked text', async () => {
  const prisma = (await import('../src/config/prisma.js')).default;
  const { createQuestion } = await import('../src/controllers/questionController.js');
  const original = prisma.$transaction;
  let writes = 0, status, body;
  prisma.$transaction = async () => { writes++; throw new Error('must not persist unchecked text'); };
  globalThis.fetch = async () => { throw new Error('provider offline'); };
  try {
    await createQuestion({ body: { session_id: 950, question_text: 'Uncached outage academic fixture' }, user: { id: 953 }, classroom: {} }, { locals: {}, status(code) { status = code; return this; }, json(data) { body = data; } }, err => { throw err; });
    assert.equal(status, 503);
    assert.equal(body.code, 'MODERATION_UNAVAILABLE');
    assert.equal(writes, 0);
  } finally { prisma.$transaction = original; }
});

test('moderation overload falls back once and still rejects unrelated content', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(JSON.parse(options.body).generationConfig.fallbackModel, undefined);
    return calls.length === 1 ? { ok: false, status: 503, json: async () => ({}) } : reply('{"isSafe":false,"category":"off_topic","reason":"Unrelated to the lecture"}');
  };
  const result = await checkAIModeration('Who will win the football match tomorrow? fallback fixture', 'CPU');
  assert.equal(result.reviewed, true);
  assert.equal(result.isSafe, false);
  assert.equal(result.category, 'off_topic');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /gemini-3.5-flash-lite/);
});

test('explicit moderation timeout policy allows one fallback within the shared deadline', async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    const config = JSON.parse(options.body).generationConfig;
    assert.equal(config.attemptTimeoutMs, undefined);
    assert.equal(config.retryTimeout, undefined);
    if (calls === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    return reply('checked');
  };
  assert.equal(await generateTextWithFallback('fixture', { retryTimeout: true, attemptTimeoutMs: 100, timeoutMs: 2000 }), 'checked');
  assert.equal(calls, 2);
});
