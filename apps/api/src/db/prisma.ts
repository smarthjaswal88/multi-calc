import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

/**
 * A single Prisma client for the process.
 *
 * Cached on globalThis so ts-node-dev's respawn does not accumulate connections against the
 * database on every file save.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error'] : ['error', 'warn'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

/** The transaction client type, for services that must run inside one. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
