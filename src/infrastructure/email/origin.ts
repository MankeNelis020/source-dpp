import { loadSourceEnvironment, SourceEnvironmentError } from "@/infrastructure/environment/source-environment";

/** Trusted public origin for portal links. Never derived from the request Host header. */
export function trustedAppOrigin(env = loadSourceEnvironment()): string {
  const configured = env.appPublicUrl?.replace(/\/$/, "");
  if (configured) return configured;
  if (env.runtime === "local") return "http://localhost:3000";
  throw new SourceEnvironmentError(
    "SOURCE environment configuration mismatch: NEXT_PUBLIC_SOURCE_APP_URL is required to build supplier portal links."
  );
}

export function portalUrlForToken(token: string, env = loadSourceEnvironment()): string {
  return `${trustedAppOrigin(env)}/s/${token}`;
}
