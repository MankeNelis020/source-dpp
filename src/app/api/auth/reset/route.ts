import { getRuntimeRateLimiter, getSourceEnvironment } from "@/infrastructure/runtime";
import { jsonError, originAllowed } from "../../source/_lib";
import { clientIp } from "@/server/source/principal";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const limited = await getRuntimeRateLimiter().consume({
      key: `auth:reset:${clientIp(request)}`,
      limit: 5,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const env = getSourceEnvironment();
    if (env.identityProvider !== "supabase") {
      return Response.json({
        ok: true,
        message: "If an account exists, password reset continues through your identity provider.",
      });
    }
    return Response.json({
      ok: true,
      message: "If an account exists, we sent reset instructions.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
