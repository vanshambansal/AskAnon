import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import cloudinary from '../config/cloudinary.js';
import { fail } from '../middleware/accessMiddleware.js';

export function imageReceipt(userId, url, publicId) {
  return jwt.sign({ purpose: 'question-image', url, public_id: publicId }, process.env.CLERK_SECRET_KEY, { subject: String(userId), expiresIn: '1h', algorithm: 'HS256' });
}
export function verifyImageReceipt(receipt, userId, url) {
  let data;
  try { data = jwt.verify(receipt, process.env.CLERK_SECRET_KEY, { algorithms: ['HS256'] }); }
  catch { fail(400, 'Please attach the image again'); }
  if (data.purpose !== 'question-image' || data.sub !== String(userId) || data.url !== url) fail(400, 'Invalid image attachment');
  return data.public_id;
}
export async function queueAsset(asset, delayMs = 0, db = prisma) {
  if (!asset?.public_id) return;
  const resource_type = asset.file_type === 'pdf' || asset.resource_type === 'raw' ? 'raw' : 'image';
  await db.storageCleanup.upsert({
    where: { public_id_resource_type: { public_id: asset.public_id, resource_type } },
    create: { public_id: asset.public_id, resource_type, not_before: new Date(Date.now() + delayMs) },
    update: { not_before: new Date(Date.now() + delayMs) }
  });
}
export async function queueAssets(assets, delayMs = 0, db = prisma) {
  const unique = [...new Map(assets.filter(asset => asset?.public_id).map(asset => {
    const resource_type = asset.file_type === 'pdf' || asset.resource_type === 'raw' ? 'raw' : 'image';
    return [`${resource_type}:${asset.public_id}`, { public_id: asset.public_id, resource_type }];
  })).values()];
  if (!unique.length) return;
  if (unique.length === 1) return queueAsset(unique[0], delayMs, db);
  const not_before = new Date(Date.now() + delayMs);
  await db.storageCleanup.createMany({ data: unique.map(asset => ({ ...asset, not_before })), skipDuplicates: true });
  // Expedite previously scheduled orphan cleanup while retaining shared-reference checks.
  await db.storageCleanup.updateMany({ where: { OR: unique }, data: { not_before } });
}
let cleaning = false;
export async function retryAssetCleanup() {
  if (cleaning) return;
  cleaning = true;
  try {
    const jobs = await prisma.storageCleanup.findMany({ where: { not_before: { lte: new Date() } }, take: 20 });
    for (const job of jobs) {
      try {
        const refs = await Promise.all([
          prisma.sessionMedia.count({ where: { public_id: job.public_id } }),
          prisma.courseMaterial.count({ where: { public_id: job.public_id } }),
          prisma.question.count({ where: { image_public_id: job.public_id } })
        ]);
        if (!refs.some(Boolean)) {
          const result = await cloudinary.uploader.destroy(job.public_id, { resource_type: job.resource_type });
          if (!['ok', 'not found'].includes(result.result)) throw new Error('Storage deletion incomplete');
        }
        await prisma.storageCleanup.delete({ where: { public_id_resource_type: { public_id: job.public_id, resource_type: job.resource_type } } });
      } catch {
        await prisma.storageCleanup.update({ where: { public_id_resource_type: { public_id: job.public_id, resource_type: job.resource_type } }, data: { attempts: { increment: 1 }, not_before: new Date(Date.now() + 60000) } }).catch(() => {});
      }
    }
  } finally { cleaning = false; }
}
export async function cleanupAsset(asset) {
  await queueAsset(asset);
  await retryAssetCleanup();
}
