/**
 * Cache Manager
 * Manages caching of dynamic options with TTL support and invalidation strategies
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
  dependencies?: string[]; // Other cache keys this entry depends on
}

export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private defaultTTL: number;
  private maxCacheSize: number;

  constructor(defaultTTL: number = 15 * 60 * 1000, maxCacheSize: number = 1000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL; // Default 15 minutes
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Generate a cache key from field name and dependencies
   */
  generateCacheKey(
    fieldName: string,
    nodeType?: string,
    dependentValues?: Record<string, any>
  ): string {
    const parts = [nodeType, fieldName].filter(Boolean);
    if (dependentValues && Object.keys(dependentValues).length > 0) {
      parts.push(JSON.stringify(dependentValues));
    }
    return parts.join('-');
  }

  /**
   * Get data from cache if valid
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.timestamp = Date.now();
    return entry.data;
  }

  /**
   * Set data in cache with optional TTL
   */
  set(key: string, data: T, ttl?: number, dependencies?: string[]): void {
    // Enforce max cache size using LRU eviction
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      dependencies
    });
  }

  /**
   * Check if a cache entry exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    // Also invalidate entries that depend on this key
    this.invalidateDependents(key);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.invalidate(key));
  }

  /**
   * Invalidate all entries that depend on a given key
   */
  private invalidateDependents(dependencyKey: string): void {
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (entry.dependencies?.includes(dependencyKey)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Check if an entry has expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict the oldest entry (LRU)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0, // Would need to track hits/misses for this
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Get or set with a factory function
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
    dependencies?: string[]
  ): Promise<T> {
    // Check cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Generate new value
    const value = await factory();
    this.set(key, value, ttl, dependencies);
    return value;
  }

  /**
   * Batch get multiple keys
   */
  getMany(keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    
    keys.forEach(key => {
      const value = this.get(key);
      if (value !== null) {
        results.set(key, value);
      }
    });

    return results;
  }

  /**
   * Batch set multiple entries
   */
  setMany(entries: Array<{ key: string; data: T; ttl?: number; dependencies?: string[] }>): void {
    entries.forEach(({ key, data, ttl, dependencies }) => {
      this.set(key, data, ttl, dependencies);
    });
  }

  /**
   * Update TTL for an existing entry
   */
  updateTTL(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      entry.ttl = ttl;
      entry.timestamp = Date.now(); // Reset timestamp
      return true;
    }
    return false;
  }
}