export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PHASE === "phase-export") {
    return;
  }
  const { bootSourceRuntime } = await import("@/infrastructure/runtime");
  await bootSourceRuntime();
}
