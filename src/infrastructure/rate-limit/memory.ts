import type { RateLimitConsumeInput, RateLimitResult, RateLimiter } from "./port";

interface Bucket {
  windowStart: number;
  count: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  async consume(input: RateLimitConsumeInput, now = new Date()): Promise<RateLimitResult> {
    const windowMs = input.windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    const current = this.buckets.get(input.key);
    const bucket =
      current && current.windowStart === windowStart ? current : { windowStart, count: 0 };
    bucket.count += 1;
    this.buckets.set(input.key, bucket);
    const allowed = bucket.count <= input.limit;
    return {
      allowed,
      remaining: Math.max(0, input.limit - bucket.count),
      resetAt: new Date(windowStart + windowMs),
    };
  }
}

let singleton: MemoryRateLimiter | undefined;

export function getMemoryRateLimiter(): MemoryRateLimiter {
  if (!singleton) singleton = new MemoryRateLimiter();
  return singleton;
}
