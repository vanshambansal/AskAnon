import prisma from '../config/prisma.js';

// Serializable writes preserve vote/pin/lifecycle invariants across concurrent requests.
export async function classroomTransaction(work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 20000 });
    } catch (err) {
      if (err.code !== 'P2034' || attempt === 2) throw err;
    }
  }
}
