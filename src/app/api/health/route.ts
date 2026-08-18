import { getPersistenceHealth, getSourceEnvironment, bootSourceRuntime } from "@/infrastructure/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await bootSourceRuntime();
    const env = getSourceEnvironment();
    const health = getPersistenceHealth();
    if (health.database !== "ok") {
      return Response.json(
        { database: "error", persistence: env.persistence },
        { status: 503 }
      );
    }
    return Response.json({
      database: "ok",
      persistence: health.persistence,
    });
  } catch {
    return Response.json({ database: "error", persistence: "postgres" }, { status: 503 });
  }
}
