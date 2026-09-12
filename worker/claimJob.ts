// worker/claimJob.ts — atomic FIFO job claim using Postgres row locking
// (PRD §4.1). `FOR UPDATE SKIP LOCKED` guarantees two worker loops can never
// claim the same row — this is what makes the concurrency cap real.

import { prisma } from "../prisma-client";

export interface ClaimedJob {
  id: string;
  status: string;
  receiptId: string;
  attemptCount: number;
  claimedBy: string | null;
  claimedAt: Date | null;
}

export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET status = 'processing', "claimedAt" = now(), "claimedBy" = ${workerId}
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'pending'
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `;
  return rows[0] ?? null;
}