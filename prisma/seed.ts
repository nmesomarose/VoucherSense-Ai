import { prisma } from "../prisma-client";

/**
 * Seeds a demo user (with no credentials) so a fresh database is never
 * user-less. Account sign-up is handled by the app (register/login); the demo
 * row is a plain fallback that keeps ownership checks coherent. Idempotent:
 * reuses the first existing user if one is already present.
 */
async function main() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (existing) {
    console.log(`Demo user already present: ${existing.id}`);
    return;
  }

  const demo = await prisma.user.create({ data: {} });
  console.log(`Created demo user: ${demo.id}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });