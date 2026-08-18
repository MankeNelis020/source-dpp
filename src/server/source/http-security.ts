/**
 * Cookie-authenticated mutations require Origin or Referer matching Host.
 * SameSite is defense in depth, not the complete CSRF control.
 * Bearer portal routes should call originAllowed(request, "bearer").
 */
export function originAllowed(request: Request, mode: "cookie" | "bearer" = "cookie"): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) return false;
  const matchesHost = (value: string) => {
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };
  if (origin) return matchesHost(origin);
  if (referer) return matchesHost(referer);
  return mode === "bearer";
}
