import { NextRequest } from "next/server";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand } from "@/server/source/commands/dispatch";
import type { CommandEnvelope } from "@/server/source/types";
import { jsonError, originAllowed, principalFromRequest } from "../_lib";

export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const principal = await principalFromRequest();
    const body = (await request.json()) as Partial<CommandEnvelope>;
    if (!body.command) return Response.json({ error: "VALIDATION", message: "command required" }, { status: 400 });
    const outcome = dispatchCommand({
      store: getMemoryPersistence(),
      principal,
      envelope: {
        commandId: body.commandId ?? crypto.randomUUID(),
        idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
        principalId: principal.userId,
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
