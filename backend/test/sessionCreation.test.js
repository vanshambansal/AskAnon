import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = '';
const { default: prisma } = await import('../src/config/prisma.js');
const { createSession } = await import('../src/controllers/sessionController.js');

test('lecture creation retries a unique-code collision and responds before course-view maintenance', async t => {
  const originalCreate = prisma.session.create;
  const originalCourse = prisma.course.findUnique;
  let attempts = 0, finishMaintenance;
  const maintenance = new Promise(resolve => { finishMaintenance = resolve; });
  prisma.session.create = async ({ data }) => {
    if (++attempts === 1) throw Object.assign(new Error('Code collision'), { code: 'P2002' });
    return { id: 720, ...data };
  };
  prisma.course.findUnique = () => maintenance;
  t.after(() => {
    finishMaintenance(null);
    prisma.session.create = originalCreate;
    prisma.course.findUnique = originalCourse;
  });
  let status, body;
  await createSession({
    body: { teacher_id: 701, title: 'New lecture', course_id: 702 },
    assignedCourse: { id: 702, teacher_id: 701, course_code: 'CS', title: 'Computer systems' },
    app: { get: () => null }
  }, { status(code) { status = code; return this; }, json(value) { body = value; } });
  assert.equal(status, 201);
  assert.equal(attempts, 2);
  assert.match(body.session_code, /^[A-Z0-9]{6}$/);
  assert.equal(body.course.course_code, 'CS');
  assert.equal(body.teacher_id, 701);
  finishMaintenance(null);
  await new Promise(resolve => setImmediate(resolve));
});
