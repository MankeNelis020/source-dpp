import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 300;

export function verifyResendWebhookSignature(args: {
  secret: string;
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  now?: Date;
}): boolean {
  if (!args.secret || !args.svixId || !args.svixTimestamp || !args.svixSignature) return false;
  const timestamp = Number(args.svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor((args.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - timestamp) > MAX_SKEW_SECONDS) return false;

  const key = args.secret.startsWith("whsec_")
    ? Buffer.from(args.secret.slice("whsec_".length), "base64")
    : Buffer.from(args.secret, "utf8");
  const signed = `${args.svixId}.${args.svixTimestamp}.${args.payload}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");
  const presented = args.svixSignature.split(/\s+/).flatMap((part) => {
    const value = part.includes(",") ? part.split(",")[1] : part.replace(/^v1=/, "");
    return value ? [value] : [];
  });
  return presented.some((signature) => {
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export function signResendWebhookForTests(args: {
  secret: string;
  payload: string;
  svixId: string;
  svixTimestamp: string;
}): string {
  const key = args.secret.startsWith("whsec_")
    ? Buffer.from(args.secret.slice("whsec_".length), "base64")
    : Buffer.from(args.secret, "utf8");
  const expected = createHmac("sha256", key)
    .update(`${args.svixId}.${args.svixTimestamp}.${args.payload}`)
    .digest("base64");
  return `v1,${expected}`;
}
