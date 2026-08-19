/** Canonical origin for Auth email redirects. Prefer configured app URL over the current host. */
export function authEmailRedirectTo(appPublicUrl: string | null | undefined, nextPath: string): string {
  const fallback = typeof window !== "undefined" ? window.location.origin : "";
  const origin = (appPublicUrl || fallback).replace(/\/$/, "");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
