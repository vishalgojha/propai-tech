import type { IncomingMessage } from "node:http";

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
};

type RateBucket = {
  count: number;
  resetAtMs: number;
};

export type RateLimiterOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: IncomingMessage, scope: string) => string;
};

export type RateLimiter = {
  check: (req: IncomingMessage, scope: string) => RateLimitDecision;
};

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const state = new Map<string, RateBucket>();
  const windowMs = Math.max(1000, Number(options.windowMs) || 60000);
  const max = Math.max(1, Number(options.max) || 180);
  const keyFn = options.keyFn || defaultKeyFn;
  const cleanupEveryMs = windowMs;
  let lastCleanupMs = 0;

  return {
    check(req, scope) {
      const now = Date.now();
      const key = keyFn(req, scope);
      const bucket = getOrCreateBucket(state, key, now, windowMs);
      bucket.count += 1;

      const remaining = Math.max(0, max - bucket.count);
      const resetSeconds = Math.max(0, Math.ceil((bucket.resetAtMs - now) / 1000));
      const allowed = bucket.count <= max;

      if (now - lastCleanupMs > cleanupEveryMs && state.size > 128) {
        cleanupBuckets(state, now);
        lastCleanupMs = now;
      }

      return {
        allowed,
        limit: max,
        remaining,
        resetSeconds,
        retryAfterSeconds: resetSeconds
      };
    }
  };
}

function getOrCreateBucket(
  state: Map<string, RateBucket>,
  key: string,
  nowMs: number,
  windowMs: number
): RateBucket {
  const existing = state.get(key);
  if (!existing || nowMs >= existing.resetAtMs) {
    const created: RateBucket = {
      count: 0,
      resetAtMs: nowMs + windowMs
    };
    state.set(key, created);
    return created;
  }
  return existing;
}

function cleanupBuckets(state: Map<string, RateBucket>, nowMs: number) {
  for (const [key, bucket] of state.entries()) {
    if (!bucket || nowMs >= bucket.resetAtMs) {
      state.delete(key);
    }
  }
}

function defaultKeyFn(req: IncomingMessage, scope: string): string {
  const ip = requestIp(req);
  return `${ip}|${scope}`;
}

function requestIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = String(raw).split(",")[0]?.trim();
    if (first) return first;
  }

  const fromSocket = req.socket?.remoteAddress || "";
  if (fromSocket.trim().length > 0) return fromSocket;
  return "unknown";
}
