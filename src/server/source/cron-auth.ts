import { timingSafeEqual } from "node:crypto";
import { SourceError } from "@/server/source/types";
import { getSourceEnvironment } from "@/infrastructure/runtime";

export function requireCronSecret(request: Request) {
  let secret: string | undefined;
  try {
    secret = getSourceEnvironment().cronSecret;
  } catch {
    secret = process.env.CRON_SECRET;
  }
  if (!secret) {
    throw new SourceError("UNAUTHENTICATED", "Worker is not configured.", 401);
  }
  const header = request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : header;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (!token || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new SourceError("UNAUTHENTICATED", "Worker is not configured.", 401);
  }
}
