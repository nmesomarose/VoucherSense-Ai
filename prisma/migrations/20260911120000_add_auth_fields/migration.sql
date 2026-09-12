-- AlterTable
-- Auth redesign: nullable credential fields for the account sign-in/registration
-- flow. Nullable so pre-existing demo rows stay valid; the seed backfills them.
ALTER TABLE "User" ADD COLUMN "email" TEXT,
ADD COLUMN "passwordHash" TEXT;

-- CreateIndex
-- Unique on a nullable column allows many NULLs, so legacy rows are unaffected.
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");