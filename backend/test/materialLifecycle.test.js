import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.REDIS_URL = '';
const { resolveLectureCourse } = await import('../src/utils/materialLifecycle.js');

test('standalone uploads reuse an owned legacy general vault and link the lecture', async () => {
  const existing = { id: 7, teacher_id: 3, course_code: 'GEN100' };
  let search, linked;
  const tx = { course: { findFirst: async args => { search = args; return existing; }, create: async () => { throw new Error('must reuse'); } }, session: { update: async args => { linked = args; } } };
  assert.equal(await resolveLectureCourse(tx, { id: 9, teacher_id: 3, course_id: null }, { id: 3, role: 'teacher' }), existing);
  assert.equal(search.where.teacher_id, 3);
  assert.ok(search.where.OR.some(item => item.course_code === 'GEN100'));
  assert.deepEqual(linked.data, { course_id: 7 });
});

test('first standalone resource creates a general vault; another host cannot attach to it', async () => {
  let created, linked;
  const tx = { course: { findFirst: async () => null, create: async ({ data }) => { created = data; return { id: 8, ...data }; } }, session: { update: async args => { linked = args; } } };
  await resolveLectureCourse(tx, { id: 10, teacher_id: 3, course_id: null }, { id: 3, role: 'teacher' });
  assert.equal(created.teacher_id, 3);
  assert.match(created.course_code, /^GEN-/);
  assert.equal(linked.data.course_id, 8);
  await assert.rejects(resolveLectureCourse(tx, { id: 10, teacher_id: 99 }, { id: 3, role: 'teacher' }), error => error.status === 403);
});
