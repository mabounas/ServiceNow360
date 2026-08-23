import { PrismaClient } from '@prisma/client';

/**
 * Neon (comme PgBouncer ou le serveur `prisma dev`) place un pooler en mode
 * transaction devant PostgreSQL : les prepared statements de Prisma y sont
 * réutilisés entre connexions et la base répond
 * « prepared statement "s0" already exists ».
 *
 * Le paramètre `pgbouncer=true` désactive ce cache. L'intégration Vercel/Neon
 * ne le pose pas sur `DATABASE_URL`, on l'ajoute donc ici : l'option est sans
 * effet néfaste sur une connexion directe.
 */
function connectionUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (raw.includes('pgbouncer=')) return raw;
  return raw + (raw.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
