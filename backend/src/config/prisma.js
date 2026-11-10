import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

// Reserve connections for the vector adapter, administration and test processes.
// A session-mode Supabase pool is shared; the CPU-based Prisma default can exhaust it.
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null
const limit = Number(process.env.PRISMA_CONNECTION_LIMIT || 4)
if (databaseUrl) databaseUrl.searchParams.set('connection_limit', String(Number.isInteger(limit) && limit > 0 ? limit : 4))
const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl.toString() } } } : {})

export default prisma
