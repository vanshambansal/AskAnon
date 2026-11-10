import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';

if (process.env.RUN_SCHEMA_TESTS !== '1') throw new Error('Set RUN_SCHEMA_TESTS=1 to create and remove an isolated QA schema.');
const schema = 'qa_bootstrap_' + randomBytes(6).toString('hex');
assert.match(schema, /^qa_bootstrap_[a-f0-9]{12}$/);
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const connection = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
let created = false;
try {
  await connection.connect();
  const existing = await connection.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
  assert.equal(existing.rowCount, 0);
  await connection.query('BEGIN');
  await connection.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await connection.query(`SET LOCAL search_path TO "${schema}", public, extensions`);
  await connection.query(await readFile(new URL('../prisma/baseline.sql', import.meta.url), 'utf8'));
  await connection.query('COMMIT');
  const tables = await connection.query('SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1', [schema]);
  assert.equal(tables.rows[0].count, 15);
  const user = await prisma.user.create({ data: { clerk_user_id: schema, email: schema + '@example.test', role: 'teacher' } });
  const course = await prisma.course.create({ data: { teacher_id: user.id, course_code: 'QA', title: 'Bootstrap QA' } });
  const session = await prisma.session.create({ data: { teacher_id: user.id, course_id: course.id, session_code: 'QA0001', title: 'Bootstrap' } });
  const question = await prisma.question.create({ data: { session_id: session.id, question_text: 'Fresh schema?', moderation_status: 'checked' } });
  await prisma.vote.create({ data: { question_id: question.id, user_id: user.id } });
  await prisma.bookmark.create({ data: { question_id: question.id, user_id: user.id } });
  const material = await prisma.courseMaterial.create({ data: { course_id: course.id, title: 'Fixture', public_id: 'not-uploaded', file_url: 'https://example.invalid/fixture.pdf' } });
  await prisma.materialChunk.create({ data: { material_id: material.id, chunk_text: 'A synthetic academic excerpt.', chunk_index: 0, page_number: 1 } });
  const poll = await prisma.poll.create({ data: { session_id: session.id, question: 'Ready?', options: { create: [{ text: 'Yes', index: 0 }, { text: 'No', index: 1 }] } }, include: { options: true } });
  await prisma.pollVote.create({ data: { poll_id: poll.id, option_id: poll.options[0].id, voter_key: 'user_1', user_id: user.id } });
  const job = await prisma.sessionDeletionJob.create({ data: { owner_id: user.id, sessions: [{ id: session.id }], batch: false } });
  await prisma.session.update({ where: { id: session.id }, data: { deletion_job_id: job.id } });
  const { queueAssets } = await import('../src/utils/storageLifecycle.js');
  await queueAssets([{ public_id: 'qa-shared', file_type: 'pdf' }, { public_id: 'qa-shared' }, { public_id: 'qa-second' }], 0, prisma);
  assert.equal(await prisma.storageCleanup.count(), 3);
  assert.equal(await prisma.question.count(), 1);
  assert.equal(await prisma.materialChunk.count(), 1);
  console.log(JSON.stringify({ bootstrapPassed: true, isolatedTables: tables.rows[0].count, prismaCrudPassed: true }));
} finally {
  await prisma.$disconnect();
  await connection.query('ROLLBACK').catch(() => {});
  if (created) {
    // Only this invocation's guarded, newly created namespace is ever removed.
    await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    const remaining = await connection.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
    assert.equal(remaining.rowCount, 0);
    console.log('Isolated bootstrap schema removed; public application tables were not altered.');
  }
  await connection.end();
}
