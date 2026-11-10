// Read-only latency/round-trip probe. No row contents or connection secrets are printed.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('connection_limit', '1');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ emit: 'event', level: 'query' }] });
let statements = 0;
prisma.$on('query', () => statements++);
try {
  for (const [label, read] of [
    ['single-table', () => prisma.session.findFirst({ select: { id: true } })],
    ['question-with-session', () => prisma.question.findFirst({ include: { session: true }, orderBy: { id: 'asc' } })]
  ]) {
    for (let sample = 0; sample < 3; sample++) {
      statements = 0;
      const started = performance.now();
      await read();
      console.log(JSON.stringify({ label, sample, ms: Math.round(performance.now() - started), statements }));
    }
  }
} finally { await prisma.$disconnect(); }
