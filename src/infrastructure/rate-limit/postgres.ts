import type { Pool } from "pg";
import type { RateLimitConsumeInput, RateLimitResult, RateLimiter } from "./port";

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: Pool) {}

  async consume(input: RateLimitConsumeInput, now = new Date()): Promise<RateLimitResult> {
    const windowMs = input.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const { rows } = await this.pool.query(
      `INSERT INTO rate_limit_windows (key, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start)
       DO UPDATE SET count = rate_limit_windows.count + 1
       RETURNING count`,
      [input.key, windowStart.toISOString()]
    );
    const count = Number(rows[0]?.count ?? 1);
    return {
      allowed: count <= input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt: new Date(windowStart.getTime() + windowMs),
    };
  }
}
