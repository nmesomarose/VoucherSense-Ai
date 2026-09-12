// worker/index.ts — long-running batch processor. Runs config.queue.concurrency
// independent loops, each cycling reaper -> claim -> process. Durable and
// independent of browser/React/Next state. Requires a persistent-process host
// (PRD §4 implementation note — NOT compatible with default serverless hosting).

import { hostname } from "node:os";
import { config, validateConfig } from "../config";
import { prisma } from "../prisma-client";
import { claimJob } from "./claimJob";
import { reapStaleJobs } from "./reapStaleJobs";
import { processJob } from "./processJob";

try {
  validateConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const workerId = `${hostname()}-${process.pid}`;
let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop(loopIndex: number): Promise<void> {
  const loopId = `${workerId}-${loopIndex}`;
  while (!shuttingDown) {
    try {
      // 1. Reap stale 'processing' jobs before claiming new work (PRD §4.3).
      await reapStaleJobs();
      // 2. Atomically claim the oldest pending job (SKIP LOCKED).
      const claimed = await claimJob(loopId);
      if (claimed) {
        console.log(`[worker ${loopId}] claimed job ${claimed.id}`);
        await processJob(claimed.id);
      } else {
        await sleep(config.queue.pollIntervalMs);
      }
    } catch (err) {
      console.error(`[worker ${loopId}] loop error:`, err);
      await sleep(config.queue.pollIntervalMs);
    }
  }
  await prisma.$disconnect();
}

async function main(): Promise<void> {
  console.log(`VoucherSense worker starting: ${workerId}`);
  console.log(
    `concurrency=${config.queue.concurrency} pollInterval=${config.queue.pollIntervalMs}ms ` +
      `model=${config.ai.model}`,
  );

  const loops = Array.from({ length: config.queue.concurrency }, (_, i) => runLoop(i));
  await Promise.all(loops);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[worker] received ${signal}; draining`);
    shuttingDown = true;
  });
}

main().catch((err) => {
  console.error("[worker] crashed:", err);
  process.exit(1);
});