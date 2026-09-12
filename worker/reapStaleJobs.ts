// worker/reapStaleJobs.ts — PRD §4.3. Runs on every poll cycle before claiming
// new work so a job abandoned mid-processing by a crashed or restarted worker
// can never sit in `processing` forever. Reclaimed jobs with retries remaining
// go back to `pending` (re-entering the FIFO by their original createdAt);
// jobs that exhausted their retries go to `failed` with an honest message.

import { config } from "../config";
import { prisma } from "../prisma-client";

export async function reapStaleJobs(): Promise<void> {
  const maxAttempts = config.ai.maxRetries + 1;
  await prisma.$executeRaw`
    UPDATE "Job"
    SET
      status = CASE WHEN "attemptCount" >= ${maxAttempts} THEN 'failed'::"JobStatus" ELSE 'pending'::"JobStatus" END,
      "errorMessage" = CASE WHEN "attemptCount" >= ${maxAttempts}
        THEN 'Job abandoned by a worker that did not complete in time.'
        ELSE "errorMessage" END,
      "claimedBy" = NULL,
      "claimedAt" = NULL
    WHERE status = 'processing'::"JobStatus"
      AND "claimedAt" < now() - (${config.queue.staleJobTimeoutMs}::text || ' milliseconds')::interval;
  `;
}