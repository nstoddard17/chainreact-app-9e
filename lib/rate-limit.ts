import { LRUCache } from 'lru-cache';

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max number of unique tokens per interval
}

interface RateLimitResult {
  limit: number;
  remaining: number;
  reset: number;
}

class RateLimiter {
  private cache: LRUCache<string, { count: number; reset: number }>;
  private interval: number;
  private uniqueTokenPerInterval: number;

  constructor(options: RateLimitOptions) {
    this.interval = options.interval;
    this.uniqueTokenPerInterval = options.uniqueTokenPerInterval;
    
    this.cache = new LRUCache({
      max: this.uniqueTokenPerInterval,
      ttl: this.interval,
    });
  }

  async check(limit: number, token: string): Promise<RateLimitResult> {
    const now = Date.now();
    const reset = now + this.interval;
    
    const existing = this.cache.get(token);
    
    if (!existing) {
      // First request for this token
      this.cache.set(token, { count: 1, reset });
      return {
        limit,
        remaining: limit - 1,
        reset
      };
    }

    // Check if the window has expired
    if (now > existing.reset) {
      // Window expired, reset counter
      this.cache.set(token, { count: 1, reset });
      return {
        limit,
        remaining: limit - 1,
        reset
      };
    }

    // Within the window, check if limit exceeded
    if (existing.count >= limit) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((existing.reset - now) / 1000)} seconds`);
    }

    // Increment counter
    existing.count++;
    this.cache.set(token, existing);

    return {
      limit,
      remaining: limit - existing.count,
      reset: existing.reset
    };
  }

  // Get current status without incrementing
  status(token: string): RateLimitResult | null {
    const existing = this.cache.get(token);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    if (now > existing.reset) {
      // Window expired
      return null;
    }

    return {
      limit: 0, // We don't know the limit without the context
      remaining: Math.max(0, 100 - existing.count), // Assuming default limit of 100
      reset: existing.reset
    };
  }

  // Clear a specific token's rate limit
  clear(token: string): void {
    this.cache.delete(token);
  }

  // Clear all rate limits
  clearAll(): void {
    this.cache.clear();
  }

  // Get cache stats
  getStats(): {
    size: number;
    maxSize: number;
    interval: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.uniqueTokenPerInterval,
      interval: this.interval
    };
  }
}

// Default rate limiter instance
const defaultRateLimiter = new RateLimiter({
  interval: 60 * 60 * 1000, // 1 hour
  uniqueTokenPerInterval: 500,
});

// Export the class and a factory function
export default function rateLimit(options: RateLimitOptions): RateLimiter {
  return new RateLimiter(options);
}

export { RateLimiter, defaultRateLimiter };

// Utility function for Next.js API routes
export function withRateLimit(
  handler: (req: any, res: any) => Promise<any>,
  options?: {
    limit?: number;
    interval?: number;
    uniqueTokenPerInterval?: number;
    keyGenerator?: (req: any) => string;
  }
) {
  const limiter = new RateLimiter({
    interval: options?.interval || 60 * 60 * 1000, // 1 hour default
    uniqueTokenPerInterval: options?.uniqueTokenPerInterval || 500,
  });

  const limit = options?.limit || 100;
  const keyGenerator = options?.keyGenerator || ((req: any) => 
    req.headers['x-forwarded-for'] || 
    req.connection?.remoteAddress || 
    'unknown'
  );

  return async (req: any, res: any) => {
    try {
      const key = keyGenerator(req);
      const result = await limiter.check(limit, key);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.reset);
      
      return handler(req, res);
    } catch (error) {
      if (error.message.includes('Rate limit exceeded')) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: error.message,
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
      throw error;
    }
  };
}

// Redis-based rate limiter for production use
export class RedisRateLimiter {
  private redis: any;
  private interval: number;

  constructor(redisClient: any, interval: number = 60 * 60 * 1000) {
    this.redis = redisClient;
    this.interval = interval;
  }

  async check(limit: number, token: string): Promise<RateLimitResult> {
    const key = `rate_limit:${token}`;
    const now = Date.now();
    const window = Math.floor(now / this.interval);
    const windowKey = `${key}:${window}`;

    const pipeline = this.redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, Math.ceil(this.interval / 1000));
    
    const results = await pipeline.exec();
    const count = results[0][1];

    if (count > limit) {
      const ttl = await this.redis.ttl(windowKey);
      const resetTime = now + (ttl * 1000);
      
      throw new Error(`Rate limit exceeded. Try again in ${ttl} seconds`);
    }

    return {
      limit,
      remaining: limit - count,
      reset: now + this.interval
    };
  }

  async clear(token: string): Promise<void> {
    const key = `rate_limit:${token}`;
    const keys = await this.redis.keys(`${key}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}