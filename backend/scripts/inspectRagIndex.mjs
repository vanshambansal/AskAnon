// Read-only index inspection. Never prints credentials or document text by default.
import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const argument = process.argv.indexOf('--material');
const materialId = argument === -1 ? null : Number(process.argv[argument + 1]);
if (argument !== -1 && (!Number.isSafeInteger(materialId) || materialId < 1)) throw new Error('Use --material followed by a positive material ID');
const showText = process.argv.includes('--show-text');
if (showText && !materialId) throw new Error('--show-text requires --material so only one chosen document is displayed');

try {
  const materials = await prisma.courseMaterial.findMany({
    where: { file_type: 'pdf', ...(materialId ? { id: materialId } : {}) },
    select: { id: true, title: true, course_id: true, index_status: true, indexed_at: true, _count: { select: { chunks: true } } },
    orderBy: { id: 'asc' }
  });
  // Catalog inspection and vector dimensions cannot be expressed by Prisma's
  // Unsupported vector field. These fixed read-only statements inspect metadata.
  const extensions = await prisma.$queryRaw`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`;
  const indexes = await prisma.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'material_chunks' ORDER BY indexname`;
  const vectors = await prisma.$queryRaw`SELECT material_id, count(*)::int AS vectors, min(vector_dims(embedding)) AS min_dimensions, max(vector_dims(embedding)) AS max_dimensions FROM material_chunks WHERE embedding IS NOT NULL GROUP BY material_id`;
  console.log(JSON.stringify({ storage: 'PostgreSQL / pgvector (server-side, not browser IndexedDB)', extensions, indexes, materials: materials.map(material => ({ ...material, vectorStats: vectors.find(row => row.material_id === material.id) || null })) }, null, 2));
  if (materialId) {
    const chunks = await prisma.materialChunk.findMany({ where: { material_id: materialId }, orderBy: { chunk_index: 'asc' }, select: { id: true, chunk_index: true, page_number: true, chunk_text: true } });
    console.log(JSON.stringify({ chunks: chunks.map(chunk => ({ id: chunk.id, order: chunk.chunk_index, page: chunk.page_number, characters: chunk.chunk_text.length, ...(showText ? { text: chunk.chunk_text } : {}) })) }, null, 2));
  }
} finally { await prisma.$disconnect(); }
