/**
 * Fixed-window in-memory rate limiter. Adequate for a single ECS task / single EC2 host.
 * If you scale the service beyond one task, swap this for a shared store (ElastiCache/DynamoDB).
 */
type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) prune(now);
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  current.count += 1;
  return { ok: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function prune(now: number) {
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

export function _resetRateLimits() {
  windows.clear();
}
