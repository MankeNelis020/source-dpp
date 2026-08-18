import { NextRequest } from "next/server";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand } from "@/server/source/commands/dispatch";
import { resolvePortalPrincipal } from "@/server/source/portal";
import type { Command } from "@/domain/source/types";
import { jsonError, originAllowed } from "../../../source/_lib";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const { token } = await context.params;
    const store = getMemoryPersistence();
    const principal = resolvePortalPrincipal(store, token);
    const body = (await request.json()) as { command: Command; expectedVersion?: number; idempotencyKey?: string };
    const outcome = dispatchCommand({
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
    });
    return Response.json(outcome);
  } catch (error) {
    return jsonError(error);
  }
}
