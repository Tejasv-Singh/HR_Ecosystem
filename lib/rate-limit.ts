/**
 * A small fixed-window rate limiter for authentication endpoints (spec §7).
 *
 * NOTE: state lives in this process's memory. That is correct for a single-node
 * deployment and for development, but a multi-instance deployment needs a shared
 * store (Redis) — see DECISIONS.md. The interface below is deliberately the same
 * shape a Redis-backed implementation would have.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Scales every limit below. It exists for the end-to-end suite, which drives a
 * dozen sign-ups and logins from a single address and would otherwise spend most
 * of its run rate-limited. It defaults to 1, so production behaviour is exactly
 * the numbers written at the call sites.
 */
const MULTIPLIER = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1);

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const effectiveLimit = limit * MULTIPLIER;
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: effectiveLimit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > effectiveLimit) {
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  return { ok: true, remaining: effectiveLimit - existing.count, retryAfterSeconds };
}

export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/** Best-effort client identity for rate limiting, behind a proxy or not. */
export function clientKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}
