import prisma from '../src/config/prisma.js';
import { processAndEmbedMaterial } from '../src/utils/ragService.js';
import dotenv from 'dotenv';
dotenv.config();

async function backfill() {
  console.log('=== Starting Material Chunks Backfill ===');
  const materials = await prisma.courseMaterial.findMany({
    where: { file_type: 'pdf' },
    select: { id: true, title: true, file_url: true, course_id: true }
  });

  console.log(`Found ${materials.length} PDF materials to index.`);

  for (const mat of materials) {
    console.log(`\nIndexing Material #${mat.id}: "${mat.title}" (Course #${mat.course_id})...`);
    try {
      const count = await processAndEmbedMaterial(mat.id, mat.file_url);
      console.log(`✓ Material #${mat.id} successfully indexed with ${count} chunks.`);
    } catch (err) {
      console.error(`✗ Failed to index material #${mat.id}:`, err.message);
    }
  }

  const totalChunks = await prisma.$queryRawUnsafe(`
    SELECT material_id, count(*)::int AS chunks_count
    FROM material_chunks
    GROUP BY material_id
    ORDER BY material_id ASC
  `);

  console.log('\n=== Backfill Summary ===');
  console.log('Indexed chunks per material:', totalChunks);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});
