import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file-if-exists=.env --import tsx prisma/seed.ts",
  },
  datasource: {
    // This is CLI tooling (not application code) so it may read the env var
    // directly. Optional here so `prisma generate` / `prisma validate` work
    // before .env exists; migration commands fail with a clear error instead.
    url: process.env.DATABASE_URL,
  },
});