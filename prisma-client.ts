import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config";

// Single Prisma client instance, imported everywhere else. (AGENTS.md §4)
// Prisma ORM 7 requires an explicit driver adapter; the connection string
// comes from central configuration, so this file never reads process.env.
function createAdapter() {
  return new PrismaPg({ connectionString: config.databaseUrl });
}

declare global {
  var __vouchersense_prisma: PrismaClient | undefined;
}

function buildClient(): PrismaClient {
  const adapter = createAdapter();
  return new PrismaClient({ adapter });
}

// Reuse a single instance across hot reloads in development to avoid
// exhausting the Postgres connection pool.
export const prisma: PrismaClient =
  globalThis.__vouchersense_prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__vouchersense_prisma = prisma;
}