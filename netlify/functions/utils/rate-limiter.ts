// Rate limiting utility for Netlify Functions
// Uses in-memory store (for single-instance) or can be extended to use Redis

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (event: any) => string; // Function to generate rate limit key
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyGenerator } = options;

  return (event: any): { allowed: boolean; remaining: number; resetTime: number } => {
    const key = keyGenerator 
      ? keyGenerator(event)
      : event.headers['x-forwarded-for'] || event.clientIP || 'unknown';

    const now = Date.now();
    const record = store[key];

    // Clean up expired entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      Object.keys(store).forEach(k => {
        if (store[k].resetTime < now) {
          delete store[k];
        }
      });
    }

    if (!record || record.resetTime < now) {
      // Create new record
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now + windowMs
      };
    }

    if (record.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime
      };
    }

    record.count++;
    return {
      allowed: true,
      remaining: maxRequests - record.count,
      resetTime: record.resetTime
    };
  };
}

// Pre-configured rate limiters
export const rateLimiters = {
  // Strict rate limiter: 60 requests per minute
  strict: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    keyGenerator: (event) => event.headers['x-forwarded-for'] || event.clientIP || 'unknown'
  }),

  // Moderate rate limiter: 100 requests per minute
  moderate: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyGenerator: (event) => event.headers['x-forwarded-for'] || event.clientIP || 'unknown'
  }),

  // Lenient rate limiter: 200 requests per minute
  lenient: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    keyGenerator: (event) => event.headers['x-forwarded-for'] || event.clientIP || 'unknown'
  })
};







