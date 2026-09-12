// instrumentation.ts — Next.js runs `register()` once at server startup.
// (AGENTS.md §2) Server started without the credentials it needs to do real
// work should fail fast instead of limping through a demo that silently cannot
// process anything.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateConfig } = await import("@/config");
    validateConfig();
  }
}