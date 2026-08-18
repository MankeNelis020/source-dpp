export interface RateLimitConsumeInput {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  consume(input: RateLimitConsumeInput, now?: Date): Promise<RateLimitResult>;
}

export function portalRateLimitKeys(input: {
  tokenFingerprint?: string;
  ip?: string;
  grantId?: string;
  commandType?: string;
}): { key: string; limit: number; windowSeconds: number }[] {
  const keys: { key: string; limit: number; windowSeconds: number }[] = [];
  if (input.tokenFingerprint) {
    keys.push({ key: `portal:token:${input.tokenFingerprint}`, limit: 60, windowSeconds: 60 });
  }
  if (input.ip) {
    keys.push({ key: `portal:ip:${input.ip}`, limit: 120, windowSeconds: 60 });
  }
  if (input.tokenFingerprint && input.ip) {
    keys.push({ key: `portal:token-ip:${input.tokenFingerprint}:${input.ip}`, limit: 40, windowSeconds: 60 });
  }
  if (input.grantId && input.commandType) {
    keys.push({ key: `portal:cmd:${input.grantId}:${input.commandType}`, limit: 30, windowSeconds: 60 });
  }
  return keys;
}
