// Simple sliding window rate limiter
interface RateLimitStore {
  [key: string]: number[];
}

const store: RateLimitStore = {};

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Initialize or clean up old requests
  if (!store[identifier]) {
    store[identifier] = [];
  }

  // Remove requests outside the current window
  store[identifier] = store[identifier].filter((timestamp) => timestamp > windowStart);

  const currentCount = store[identifier].length;
  const allowed = currentCount < config.maxRequests;

  if (allowed) {
    store[identifier].push(now);
  }

  const remaining = Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0));
  const resetAt = store[identifier][0] ? store[identifier][0] + config.windowMs : now + config.windowMs;

  return {
    allowed,
    remaining,
    resetAt,
  };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour

  for (const key in store) {
    store[key] = store[key].filter((timestamp) => timestamp > now - maxAge);
    if (store[key].length === 0) {
      delete store[key];
    }
  }
}, 300000); // Clean every 5 minutes
