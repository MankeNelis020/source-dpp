import { NextRequest } from "next/server";
import { getPersistence, getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { dispatchCommand } from "@/server/source/commands/dispatch";
import { resolvePortalPrincipal } from "@/server/source/portal";
import type { Command } from "@/domain/source/types";
import { jsonError, originAllowed } from "../../../source/_lib";
import { tokenFingerprint } from "@/infrastructure/crypto/tokens";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    if (!originAllowed(request, "bearer")) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const { token } = await context.params;
    const store = getPersistence();
    const principal = await resolvePortalPrincipal(store, token);
    const body = (await request.json()) as { command: Command; expectedVersion?: number; idempotencyKey?: string };
    const outcome = await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: crypto.randomUUID(),
        idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
        principalId: principal.grantId,
        organisationId: principal.organisationId,
        issuedAt: new Date().toISOString(),
        expectedVersion: body.expectedVersion,
        command: body.command,
      },
      rateLimiter: getRuntimeRateLimiter(),
      clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
      tokenFingerprint: tokenFingerprint(token),
    });
    return Response.json(outcome);
  } catch (error) {
    return jsonError(error);
  }
}
