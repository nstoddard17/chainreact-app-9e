import { EventEmitter } from 'events'
import { createHash } from 'crypto'

/**
 * Cache configuration
 */
export interface CacheConfig {
  defaultTTL: number // Time to live in milliseconds
  maxSize: number // Maximum number of items
  maxMemory: number // Maximum memory usage in bytes
  cleanupInterval: number // Cleanup interval in milliseconds
  compression: boolean // Enable compression for large items
  enableMetrics: boolean // Enable cache metrics
  persistToDisk: boolean // Persist cache to disk
  namespace?: string // Cache namespace for isolation
}

/**
 * Cache entry
 */
export interface CacheEntry<T = any> {
  key: string
  value: T
  ttl: number
  createdAt: number
  lastAccessed: number
  accessCount: number
  size: number // Estimated size in bytes
  metadata?: Record<string, any>
  compressed?: boolean
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number
  misses: number
  sets: number
  deletes: number
  evictions: number
  hitRate: number
  totalSize: number
  itemCount: number
  memoryUsage: number
  averageItemSize: number
}

/**
 * Cache invalidation rule
 */
export interface InvalidationRule {
  pattern: string | RegExp
  condition?: (entry: CacheEntry) => boolean
  tags?: string[]
}

/**
 * Cache warming configuration
 */
export interface WarmupConfig {
  enabled: boolean
  keys: string[]
  interval: number // milliseconds
  maxConcurrency: number
  warmer: (key: string) => Promise<any>
}

/**
 * Intelligent cache manager with multiple strategies
 */
export class CacheManager<T = any> extends EventEmitter {
  private cache = new Map<string, CacheEntry<T>>()
  private config: CacheConfig
  private stats: CacheStats
  private cleanupTimer: NodeJS.Timeout | null = null
  private accessOrder: string[] = [] // For LRU eviction
  private sizeIndex = new Map<string, number>() // Track sizes
  private tagIndex = new Map<string, Set<string>>() // Tag-based invalidation
  private warmupTimer: NodeJS.Timeout | null = null
  private warmupConfig?: WarmupConfig

  constructor(config: Partial<CacheConfig> = {}) {
    super()
    
    this.config = {
      defaultTTL: 300000, // 5 minutes
      maxSize: 10000,
      maxMemory: 100 * 1024 * 1024, // 100MB
      cleanupInterval: 60000, // 1 minute
      compression: false,
      enableMetrics: true,
      persistToDisk: false,
      ...config
    }

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      totalSize: 0,
      itemCount: 0,
      memoryUsage: 0,
      averageItemSize: 0
    }

    this.startCleanup()
    
    console.log(`🗄️ Cache manager initialized (TTL: ${this.config.defaultTTL}ms, Max: ${this.config.maxSize} items)`)
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.updateStats('miss')
      this.emit('miss', key)
      return null
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.delete(key)
      this.updateStats('miss')
      this.emit('expired', key, entry)
      return null
    }

    // Update access info
    entry.lastAccessed = Date.now()
    entry.accessCount++
    this.updateAccessOrder(key)

    this.updateStats('hit')
    this.emit('hit', key, entry)

    // Decompress if needed
    if (entry.compressed && this.config.compression) {
      return this.decompress(entry.value)
    }

    return entry.value
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: T, options: {
    ttl?: number
    tags?: string[]
    metadata?: Record<string, any>
    priority?: 'low' | 'normal' | 'high'
  } = {}): Promise<void> {
    const ttl = options.ttl || this.config.defaultTTL
    const now = Date.now()
    
    // Calculate size
    const size = this.calculateSize(value)
    
    // Compress if enabled and beneficial
    let finalValue = value
    let compressed = false
    if (this.config.compression && size > 1024) { // Compress items > 1KB
      finalValue = this.compress(value)
      compressed = true
    }

    const entry: CacheEntry<T> = {
      key,
      value: finalValue,
      ttl,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      size,
      metadata: options.metadata,
      compressed
    }

    // Check if we need to evict items
    await this.ensureCapacity(size)

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.removeFromIndexes(key)
    }

    // Add to cache
    this.cache.set(key, entry)
    this.addToIndexes(key, entry, options.tags)
    this.updateAccessOrder(key)

    this.updateStats('set', size)
    this.emit('set', key, entry)

    console.log(`💾 Cached: ${key} (size: ${size} bytes, TTL: ${ttl}ms)`)
  }

  /**
   * Delete from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    this.cache.delete(key)
    this.removeFromIndexes(key)
    this.removeFromAccessOrder(key)

    this.updateStats('delete', -entry.size)
    this.emit('delete', key, entry)

    return true
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    return entry ? !this.isExpired(entry) : false
  }

  /**
   * Get multiple keys at once
   */
  async getMany(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>()
    
    for (const key of keys) {
      results.set(key, await this.get(key))
    }

    return results
  }

  /**
   * Set multiple key-value pairs
   */
  async setMany(items: Array<{ key: string; value: T; options?: any }>): Promise<void> {
    for (const item of items) {
      await this.set(item.key, item.value, item.options)
    }
  }

  /**
   * Get or set pattern - if not in cache, compute and cache
   */
  async getOrSet(
    key: string, 
    factory: () => Promise<T>, 
    options: {
      ttl?: number
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): Promise<T> {
    const cached = await this.get(key)
    if (cached !== null) {
      return cached
    }

    const value = await factory()
    await this.set(key, value, options)
    return value
  }

  /**
   * Invalidate cache entries by pattern or tags
   */
  invalidate(rule: InvalidationRule): number {
    let invalidated = 0
    const keysToDelete: string[] = []

    // Pattern-based invalidation
    if (typeof rule.pattern === 'string') {
      for (const key of this.cache.keys()) {
        if (key.includes(rule.pattern)) {
          keysToDelete.push(key)
        }
      }
    } else if (rule.pattern instanceof RegExp) {
      for (const key of this.cache.keys()) {
        if (rule.pattern.test(key)) {
          keysToDelete.push(key)
        }
      }
    }

    // Tag-based invalidation
    if (rule.tags) {
      for (const tag of rule.tags) {
        const taggedKeys = this.tagIndex.get(tag)
        if (taggedKeys) {
          keysToDelete.push(...Array.from(taggedKeys))
        }
      }
    }

    // Condition-based invalidation
    if (rule.condition) {
      for (const [key, entry] of this.cache.entries()) {
        if (rule.condition(entry)) {
          keysToDelete.push(key)
        }
      }
    }

    // Remove duplicates and delete
    const uniqueKeys = [...new Set(keysToDelete)]
    for (const key of uniqueKeys) {
      if (this.delete(key)) {
        invalidated++
      }
    }

    this.emit('invalidated', rule, invalidated)
    console.log(`🗑️ Invalidated ${invalidated} cache entries`)
    
    return invalidated
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const count = this.cache.size
    this.cache.clear()
    this.accessOrder = []
    this.sizeIndex.clear()
    this.tagIndex.clear()
    
    this.resetStats()
    this.emit('cleared', count)
    
    console.log(`🧹 Cache cleared: ${count} entries removed`)
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateCacheStats()
    return { ...this.stats }
  }

  /**
   * Get cache keys matching pattern
   */
  getKeys(pattern?: string | RegExp): string[] {
    const keys = Array.from(this.cache.keys())
    
    if (!pattern) return keys
    
    if (typeof pattern === 'string') {
      return keys.filter(key => key.includes(pattern))
    }
    
    return keys.filter(key => pattern.test(key))
  }

  /**
   * Configure cache warming
   */
  configureWarmup(config: WarmupConfig): void {
    this.warmupConfig = config
    
    if (config.enabled) {
      this.startWarmup()
      console.log(`🔥 Cache warming enabled: ${config.keys.length} keys, interval: ${config.interval}ms`)
    }
  }

  /**
   * Manually warm cache
   */
  async warmup(keys?: string[]): Promise<void> {
    if (!this.warmupConfig) return
    
    const keysToWarm = keys || this.warmupConfig.keys
    const concurrency = this.warmupConfig.maxConcurrency
    
    console.log(`🔥 Starting cache warmup for ${keysToWarm.length} keys...`)
    
    // Process keys in batches
    for (let i = 0; i < keysToWarm.length; i += concurrency) {
      const batch = keysToWarm.slice(i, i + concurrency)
      
      await Promise.allSettled(batch.map(async (key) => {
        try {
          if (!this.has(key)) {
            const value = await this.warmupConfig!.warmer(key)
            await this.set(key, value, { metadata: { warmed: true } })
          }
        } catch (error) {
          console.warn(`⚠️ Failed to warm cache key: ${key}`, error)
        }
      }))
    }
    
    console.log(`✅ Cache warmup completed`)
  }

  /**
   * Create cache namespace
   */
  createNamespace(namespace: string): CacheManager<T> {
    return new CacheManager<T>({
      ...this.config,
      namespace: `${this.config.namespace || 'default'}:${namespace}`
    })
  }

  /**
   * Export cache data
   */
  export(): Array<{ key: string; entry: CacheEntry<T> }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      entry: { ...entry }
    }))
  }

  /**
   * Import cache data
   */
  import(data: Array<{ key: string; entry: CacheEntry<T> }>): void {
    for (const { key, entry } of data) {
      if (!this.isExpired(entry)) {
        this.cache.set(key, entry)
        this.addToIndexes(key, entry)
        this.updateAccessOrder(key)
      }
    }
    
    console.log(`📥 Imported ${data.length} cache entries`)
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.createdAt + entry.ttl
  }

  /**
   * Calculate estimated size of value
   */
  private calculateSize(value: any): number {
    if (value === null || value === undefined) return 0
    
    if (typeof value === 'string') return value.length * 2 // UTF-16
    if (typeof value === 'number') return 8
    if (typeof value === 'boolean') return 4
    
    // For objects, estimate JSON size
    try {
      return JSON.stringify(value).length * 2
    } catch {
      return 1024 // Fallback estimate
    }
  }

  /**
   * Ensure cache has capacity for new item
   */
  private async ensureCapacity(newItemSize: number): Promise<void> {
    // Check item count limit
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    // Check memory limit
    while (this.stats.memoryUsage + newItemSize > this.config.maxMemory) {
      this.evictLRU()
    }
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return
    
    const lruKey = this.accessOrder[0]
    const entry = this.cache.get(lruKey)
    
    if (entry) {
      this.delete(lruKey)
      this.stats.evictions++
      this.emit('evicted', lruKey, entry, 'lru')
      console.log(`🗑️ Evicted LRU entry: ${lruKey}`)
    }
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.removeFromAccessOrder(key)
    
    // Add to end (most recently used)
    this.accessOrder.push(key)
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Add to indexes
   */
  private addToIndexes(key: string, entry: CacheEntry<T>, tags?: string[]): void {
    this.sizeIndex.set(key, entry.size)
    
    if (tags) {
      for (const tag of tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set())
        }
        this.tagIndex.get(tag)!.add(key)
      }
    }
  }

  /**
   * Remove from indexes
   */
  private removeFromIndexes(key: string): void {
    this.sizeIndex.delete(key)
    
    // Remove from tag index
    for (const taggedKeys of this.tagIndex.values()) {
      taggedKeys.delete(key)
    }
  }

  /**
   * Compress value
   */
  private compress(value: any): any {
    // Simple compression simulation - in real implementation, use zlib
    if (typeof value === 'string') {
      return value // Placeholder
    }
    return JSON.stringify(value) // Placeholder
  }

  /**
   * Decompress value
   */
  private decompress(value: any): any {
    // Simple decompression simulation
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
    return value
  }

  /**
   * Update statistics
   */
  private updateStats(operation: 'hit' | 'miss' | 'set' | 'delete', sizeChange: number = 0): void {
    if (!this.config.enableMetrics) return

    switch (operation) {
      case 'hit':
        this.stats.hits++
        break
      case 'miss':
        this.stats.misses++
        break
      case 'set':
        this.stats.sets++
        this.stats.memoryUsage += sizeChange
        break
      case 'delete':
        this.stats.deletes++
        this.stats.memoryUsage += sizeChange // sizeChange is negative
        break
    }

    this.updateCacheStats()
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    const totalRequests = this.stats.hits + this.stats.misses
    this.stats.hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0
    this.stats.itemCount = this.cache.size
    this.stats.totalSize = Array.from(this.sizeIndex.values()).reduce((sum, size) => sum + size, 0)
    this.stats.averageItemSize = this.stats.itemCount > 0 ? this.stats.totalSize / this.stats.itemCount : 0
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      totalSize: 0,
      itemCount: 0,
      memoryUsage: 0,
      averageItemSize: 0
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  /**
   * Start warmup timer
   */
  private startWarmup(): void {
    if (!this.warmupConfig) return
    
    this.warmupTimer = setInterval(() => {
      this.warmup()
    }, this.warmupConfig.interval)
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.delete(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: ${cleaned} expired entries removed`)
      this.emit('cleanup', cleaned)
    }
  }

  /**
   * Shutdown cache manager
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    
    if (this.warmupTimer) {
      clearInterval(this.warmupTimer)
      this.warmupTimer = null
    }
    
    this.clear()
    console.log('🛑 Cache manager shutdown complete')
  }
}

/**
 * Multi-level cache with different strategies
 */
export class MultiLevelCache<T = any> extends EventEmitter {
  private levels: Array<{ cache: CacheManager<T>; name: string; readThrough: boolean; writeThrough: boolean }> = []

  constructor() {
    super()
  }

  /**
   * Add cache level
   */
  addLevel(cache: CacheManager<T>, name: string, options: { readThrough?: boolean; writeThrough?: boolean } = {}): void {
    this.levels.push({
      cache,
      name,
      readThrough: options.readThrough ?? true,
      writeThrough: options.writeThrough ?? true
    })
    
    console.log(`🏗️ Added cache level: ${name}`)
  }

  /**
   * Get from multi-level cache
   */
  async get(key: string): Promise<T | null> {
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i]
      const value = await level.cache.get(key)
      
      if (value !== null) {
        // Found in this level - promote to higher levels
        for (let j = 0; j < i; j++) {
          if (this.levels[j].writeThrough) {
            await this.levels[j].cache.set(key, value)
          }
        }
        
        this.emit('hit', key, level.name)
        return value
      }
    }
    
    this.emit('miss', key)
    return null
  }

  /**
   * Set in multi-level cache
   */
  async set(key: string, value: T, options: any = {}): Promise<void> {
    for (const level of this.levels) {
      if (level.writeThrough) {
        await level.cache.set(key, value, options)
      }
    }
    
    this.emit('set', key)
  }

  /**
   * Delete from all levels
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false
    
    for (const level of this.levels) {
      if (level.cache.delete(key)) {
        deleted = true
      }
    }
    
    if (deleted) {
      this.emit('delete', key)
    }
    
    return deleted
  }

  /**
   * Get combined statistics
   */
  getStats(): Array<{ level: string; stats: CacheStats }> {
    return this.levels.map(level => ({
      level: level.name,
      stats: level.cache.getStats()
    }))
  }
}

/**
 * Cache key generator utility
 */
export class CacheKeyGenerator {
  private namespace: string

  constructor(namespace: string = 'default') {
    this.namespace = namespace
  }

  /**
   * Generate cache key from parameters
   */
  generate(parts: Array<string | number | object>): string {
    const keyParts = [this.namespace]
    
    for (const part of parts) {
      if (typeof part === 'object') {
        // Sort object keys for consistent hashing
        const sorted = Object.keys(part).sort().reduce((result, key) => {
          result[key] = part[key]
          return result
        }, {} as any)
        
        const hash = createHash('md5').update(JSON.stringify(sorted)).digest('hex').substring(0, 8)
        keyParts.push(hash)
      } else {
        keyParts.push(String(part))
      }
    }
    
    return keyParts.join(':')
  }

  /**
   * Generate key for provider operation
   */
  forProvider(providerId: string, operation: string, params: object = {}): string {
    return this.generate(['provider', providerId, operation, params])
  }

  /**
   * Generate key for user-specific data
   */
  forUser(userId: string, dataType: string, params: object = {}): string {
    return this.generate(['user', userId, dataType, params])
  }

  /**
   * Generate key for workflow data
   */
  forWorkflow(workflowId: string, step: string, params: object = {}): string {
    return this.generate(['workflow', workflowId, step, params])
  }
}

/**
 * Global cache instances
 */
export const caches = {
  // L1: Memory cache (fast, small)
  memory: new CacheManager({
    defaultTTL: 60000, // 1 minute
    maxSize: 1000,
    maxMemory: 10 * 1024 * 1024, // 10MB
    cleanupInterval: 30000
  }),
  
  // L2: Extended memory cache (medium speed, larger)
  extended: new CacheManager({
    defaultTTL: 300000, // 5 minutes
    maxSize: 10000,
    maxMemory: 100 * 1024 * 1024, // 100MB
    cleanupInterval: 60000,
    compression: true
  }),
  
  // L3: Persistent cache (slower, persistent)
  persistent: new CacheManager({
    defaultTTL: 3600000, // 1 hour
    maxSize: 100000,
    maxMemory: 500 * 1024 * 1024, // 500MB
    cleanupInterval: 300000,
    compression: true,
    persistToDisk: true
  })
}

/**
 * Multi-level cache instance
 */
export const multiLevelCache = new MultiLevelCache()
multiLevelCache.addLevel(caches.memory, 'memory')
multiLevelCache.addLevel(caches.extended, 'extended')
multiLevelCache.addLevel(caches.persistent, 'persistent')

/**
 * Global cache key generator
 */
export const cacheKeys = new CacheKeyGenerator('chainreact')

/**
 * Cache decorator for automatic caching
 */
export function Cached(options: {
  ttl?: number
  key?: string | ((args: any[]) => string)
  tags?: string[]
  cache?: CacheManager
} = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value
    const cache = options.cache || caches.memory

    descriptor.value = async function (this: any, ...args: any[]) {
      // Generate cache key
      let cacheKey: string
      if (typeof options.key === 'function') {
        cacheKey = options.key(args)
      } else if (options.key) {
        cacheKey = options.key
      } else {
        const providerId = this.providerId || 'unknown'
        cacheKey = cacheKeys.forProvider(providerId, propertyName, { args: args.slice(0, -1) }) // Exclude userId
      }

      // Try to get from cache
      const cached = await cache.get(cacheKey)
      if (cached !== null) {
        console.log(`💨 Cache hit: ${cacheKey}`)
        return cached
      }

      // Execute method and cache result
      try {
        const result = await method.apply(this, args)
        
        await cache.set(cacheKey, result, {
          ttl: options.ttl,
          tags: options.tags,
          metadata: { method: propertyName, cached_at: new Date().toISOString() }
        })
        
        console.log(`💾 Cache miss, stored: ${cacheKey}`)
        return result
      } catch (error) {
        // Don't cache errors
        throw error
      }
    }

    return descriptor
  }
}