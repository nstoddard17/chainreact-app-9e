/**
 * Rate limiting configuration for providers
 */
export interface RateLimitConfig {
  // Basic rate limit settings
  limit: number // Max requests allowed
  window: number // Time window in milliseconds
  type: 'requests' | 'operations' // Type of rate limit
  
  // Advanced settings
  burstLimit?: number // Allow short bursts above limit
  adaptiveThrottling?: boolean // Adjust limits based on errors
  queueEnabled?: boolean // Queue requests when limit hit
  queueMaxSize?: number // Max queue size
  
  // Provider-specific settings
  providerId?: string // Specific provider this applies to
  endpoint?: string // Specific endpoint pattern
  priority?: 'low' | 'normal' | 'high' | 'critical'
}

/**
 * Rate limit enforcement result
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  retryAfter?: number
  queuePosition?: number
  adaptiveDelay?: number
}

/**
 * Rate limit statistics
 */
export interface RateLimitStats {
  requests: number
  allowed: number
  denied: number
  queued: number
  averageWaitTime: number
  adaptiveThrottling: boolean
  currentLimit: number
  resetTime: number
}

/**
 * Request context for rate limiting
 */
export interface RequestContext {
  providerId: string
  userId: string
  endpoint?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
  metadata?: Record<string, any>
}

/**
 * Intelligent rate limiter with adaptive throttling and queuing
 */
export class RateLimiter {
  private limits: Map<string, RateLimitConfig> = new Map()
  private counters: Map<string, { count: number; resetTime: number; errors: number }> = new Map()
  private queues: Map<string, Array<{ resolve: Function; reject: Function; context: RequestContext; timestamp: number }>> = new Map()
  private stats: Map<string, RateLimitStats> = new Map()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired counters every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Configure rate limits for a provider
   */
  configure(providerId: string, configs: RateLimitConfig[]): void {
    for (const config of configs) {
      const key = this.getLimitKey(providerId, config.endpoint, config.type)
      this.limits.set(key, { ...config, providerId })
      
      // Initialize stats
      this.stats.set(key, {
        requests: 0,
        allowed: 0,
        denied: 0,
        queued: 0,
        averageWaitTime: 0,
        adaptiveThrottling: false,
        currentLimit: config.limit,
        resetTime: 0
      })
    }
    
    console.log(`✅ Rate limits configured for ${providerId}: ${configs.length} rules`)
  }

  /**
   * Check if request is allowed under rate limits
   */
  async checkLimit(context: RequestContext): Promise<RateLimitResult> {
    const { providerId, endpoint, priority = 'normal' } = context
    
    // Find applicable rate limit
    const limitKey = this.findApplicableLimit(providerId, endpoint)
    if (!limitKey) {
      return { allowed: true, remaining: Infinity, resetTime: 0 }
    }

    const config = this.limits.get(limitKey)!
    const counterKey = this.getCounterKey(providerId, context.userId, endpoint)
    
    // Update stats
    const stats = this.stats.get(limitKey)!
    stats.requests++

    // Get or create counter
    let counter = this.counters.get(counterKey)
    const now = Date.now()
    
    if (!counter || now >= counter.resetTime) {
      counter = { 
        count: 0, 
        resetTime: now + config.window,
        errors: 0
      }
      this.counters.set(counterKey, counter)
      stats.resetTime = counter.resetTime
    }

    // Calculate current effective limit (with adaptive throttling)
    const effectiveLimit = this.calculateEffectiveLimit(config, counter, stats)
    stats.currentLimit = effectiveLimit
    
    // Check if burst limit applies
    const burstAllowed = config.burstLimit && counter.count < config.burstLimit
    
    // Priority handling
    const priorityMultiplier = this.getPriorityMultiplier(priority)
    const adjustedLimit = Math.floor(effectiveLimit * priorityMultiplier)

    if (counter.count < adjustedLimit || burstAllowed) {
      // Request allowed
      counter.count++
      stats.allowed++
      
      return {
        allowed: true,
        remaining: Math.max(0, adjustedLimit - counter.count),
        resetTime: counter.resetTime,
        adaptiveDelay: stats.adaptiveThrottling ? this.calculateAdaptiveDelay(counter) : undefined
      }
    }

    // Request denied - check if queueing is enabled
    if (config.queueEnabled && this.canQueue(limitKey, config)) {
      return this.queueRequest(limitKey, context, config, stats)
    }

    // Request denied
    stats.denied++
    const retryAfter = counter.resetTime - now
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: counter.resetTime,
      retryAfter
    }
  }

  /**
   * Record an error for adaptive throttling
   */
  recordError(context: RequestContext, errorType: 'rate_limit' | 'server_error' | 'timeout'): void {
    const { providerId, endpoint } = context
    const counterKey = this.getCounterKey(providerId, context.userId, endpoint)
    const limitKey = this.findApplicableLimit(providerId, endpoint)
    
    if (!limitKey) return

    const counter = this.counters.get(counterKey)
    const config = this.limits.get(limitKey)!
    const stats = this.stats.get(limitKey)!

    if (counter && config.adaptiveThrottling) {
      counter.errors++
      
      // Enable adaptive throttling if error rate is high
      if (counter.errors > counter.count * 0.2) { // 20% error rate threshold
        stats.adaptiveThrottling = true
        console.log(`🚦 Adaptive throttling enabled for ${providerId} due to high error rate`)
      }
    }
  }

  /**
   * Record successful request for adaptive throttling recovery
   */
  recordSuccess(context: RequestContext): void {
    const { providerId, endpoint } = context
    const counterKey = this.getCounterKey(providerId, context.userId, endpoint)
    const limitKey = this.findApplicableLimit(providerId, endpoint)
    
    if (!limitKey) return

    const counter = this.counters.get(counterKey)
    const stats = this.stats.get(limitKey)!

    if (counter && stats.adaptiveThrottling) {
      // Gradually recover from adaptive throttling
      if (counter.errors > 0) {
        counter.errors = Math.max(0, counter.errors - 1)
      }
      
      // Disable adaptive throttling if error rate is low
      if (counter.errors < counter.count * 0.05) { // 5% error rate threshold
        stats.adaptiveThrottling = false
        console.log(`✅ Adaptive throttling disabled for ${providerId} - error rate normalized`)
      }
    }
  }

  /**
   * Get rate limit statistics
   */
  getStats(providerId: string): Map<string, RateLimitStats> {
    const providerStats = new Map<string, RateLimitStats>()
    
    for (const [key, stats] of this.stats.entries()) {
      if (key.startsWith(providerId)) {
        providerStats.set(key, { ...stats })
      }
    }
    
    return providerStats
  }

  /**
   * Reset rate limits for a provider/user
   */
  reset(providerId: string, userId?: string): void {
    if (userId) {
      // Reset specific user's limits
      const pattern = `${providerId}:${userId}`
      for (const key of this.counters.keys()) {
        if (key.startsWith(pattern)) {
          this.counters.delete(key)
        }
      }
    } else {
      // Reset all limits for provider
      for (const key of this.counters.keys()) {
        if (key.startsWith(providerId)) {
          this.counters.delete(key)
        }
      }
    }
    
    console.log(`🔄 Rate limits reset for ${providerId}${userId ? `:${userId}` : ''}`)
  }

  /**
   * Get current queue status
   */
  getQueueStatus(providerId: string): { queues: number; totalWaiting: number; averageWaitTime: number } {
    let queues = 0
    let totalWaiting = 0
    let totalWaitTime = 0
    const now = Date.now()

    for (const [key, queue] of this.queues.entries()) {
      if (key.startsWith(providerId)) {
        queues++
        totalWaiting += queue.length
        
        for (const item of queue) {
          totalWaitTime += now - item.timestamp
        }
      }
    }

    return {
      queues,
      totalWaiting,
      averageWaitTime: totalWaiting > 0 ? totalWaitTime / totalWaiting : 0
    }
  }

  /**
   * Cleanup expired counters and stats
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, counter] of this.counters.entries()) {
      if (now >= counter.resetTime + 60000) { // Keep for 1 minute after reset
        this.counters.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired rate limit counters`)
    }
  }

  /**
   * Calculate effective limit with adaptive throttling
   */
  private calculateEffectiveLimit(config: RateLimitConfig, counter: any, stats: RateLimitStats): number {
    if (!config.adaptiveThrottling || !stats.adaptiveThrottling) {
      return config.limit
    }

    // Reduce limit based on error rate
    const errorRate = counter.count > 0 ? counter.errors / counter.count : 0
    const throttleFactor = Math.max(0.1, 1 - (errorRate * 2)) // Reduce by up to 90%
    
    return Math.floor(config.limit * throttleFactor)
  }

  /**
   * Calculate adaptive delay between requests
   */
  private calculateAdaptiveDelay(counter: any): number {
    const errorRate = counter.count > 0 ? counter.errors / counter.count : 0
    // Add 100ms to 2000ms delay based on error rate
    return Math.floor(100 + (errorRate * 1900))
  }

  /**
   * Get priority multiplier for rate limits
   */
  private getPriorityMultiplier(priority: string): number {
    switch (priority) {
      case 'critical': return 2.0
      case 'high': return 1.5
      case 'normal': return 1.0
      case 'low': return 0.5
      default: return 1.0
    }
  }

  /**
   * Queue a request when rate limited
   */
  private queueRequest(limitKey: string, context: RequestContext, config: RateLimitConfig, stats: RateLimitStats): Promise<RateLimitResult> {
    return new Promise((resolve, reject) => {
      const queueKey = `${context.providerId}:queue:${config.endpoint || 'default'}`
      
      if (!this.queues.has(queueKey)) {
        this.queues.set(queueKey, [])
      }
      
      const queue = this.queues.get(queueKey)!
      
      // Check queue size limit
      if (config.queueMaxSize && queue.length >= config.queueMaxSize) {
        stats.denied++
        resolve({
          allowed: false,
          remaining: 0,
          resetTime: 0,
          retryAfter: 1000 // 1 second default retry
        })
        return
      }

      // Add to queue
      queue.push({
        resolve,
        reject,
        context,
        timestamp: Date.now()
      })
      
      stats.queued++
      
      // Start processing queue if not already started
      this.processQueue(queueKey, limitKey)
      
      // Return queued status
      resolve({
        allowed: false,
        remaining: 0,
        resetTime: 0,
        queuePosition: queue.length
      })
    })
  }

  /**
   * Process queued requests
   */
  private async processQueue(queueKey: string, limitKey: string): Promise<void> {
    const queue = this.queues.get(queueKey)
    if (!queue || queue.length === 0) return

    const config = this.limits.get(limitKey)!
    
    // Wait for rate limit window if needed
    const counterKey = this.getCounterKey(queue[0].context.providerId, queue[0].context.userId, queue[0].context.endpoint)
    const counter = this.counters.get(counterKey)
    
    if (counter && Date.now() < counter.resetTime) {
      const waitTime = counter.resetTime - Date.now()
      setTimeout(() => this.processQueue(queueKey, limitKey), waitTime)
      return
    }

    // Process next item in queue
    const item = queue.shift()
    if (item) {
      try {
        const result = await this.checkLimit(item.context)
        if (result.allowed) {
          item.resolve(result)
        } else {
          // Re-queue if still not allowed
          queue.unshift(item)
          setTimeout(() => this.processQueue(queueKey, limitKey), 1000)
        }
      } catch (error) {
        item.reject(error)
      }
    }

    // Continue processing if more items in queue
    if (queue.length > 0) {
      setTimeout(() => this.processQueue(queueKey, limitKey), 100)
    }
  }

  /**
   * Check if request can be queued
   */
  private canQueue(limitKey: string, config: RateLimitConfig): boolean {
    if (!config.queueEnabled) return false
    
    const queueKey = limitKey.replace(':limit:', ':queue:')
    const queue = this.queues.get(queueKey)
    
    return !queue || queue.length < (config.queueMaxSize || 100)
  }

  /**
   * Find applicable rate limit for request
   */
  private findApplicableLimit(providerId: string, endpoint?: string): string | null {
    // Try endpoint-specific limit first
    if (endpoint) {
      const endpointKey = this.getLimitKey(providerId, endpoint, 'requests')
      if (this.limits.has(endpointKey)) {
        return endpointKey
      }
    }
    
    // Fall back to general provider limit
    const generalKey = this.getLimitKey(providerId, undefined, 'requests')
    if (this.limits.has(generalKey)) {
      return generalKey
    }
    
    // Try operations limit
    const operationsKey = this.getLimitKey(providerId, undefined, 'operations')
    if (this.limits.has(operationsKey)) {
      return operationsKey
    }
    
    return null
  }

  /**
   * Generate limit configuration key
   */
  private getLimitKey(providerId: string, endpoint?: string, type?: string): string {
    return `${providerId}:limit:${endpoint || 'default'}:${type || 'requests'}`
  }

  /**
   * Generate counter key for tracking
   */
  private getCounterKey(providerId: string, userId: string, endpoint?: string): string {
    return `${providerId}:${userId}:${endpoint || 'default'}`
  }

  /**
   * Shutdown and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    // Reject all queued requests
    for (const queue of this.queues.values()) {
      for (const item of queue) {
        item.reject(new Error('Rate limiter shutting down'))
      }
    }
    
    this.limits.clear()
    this.counters.clear()
    this.queues.clear()
    this.stats.clear()
    
    console.log('🛑 Rate limiter shutdown complete')
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiter()

/**
 * Decorator for automatic rate limiting
 */
export function RateLimit(config: Omit<RateLimitConfig, 'providerId'>) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const providerId = this.providerId || 'unknown'
      const userId = args[args.length - 1] || 'unknown' // Assume last arg is userId
      
      const context: RequestContext = {
        providerId,
        userId,
        endpoint: propertyName,
        priority: config.priority
      }

      const result = await rateLimiter.checkLimit(context)
      
      if (!result.allowed) {
        if (result.queuePosition) {
          console.log(`🚦 Request queued for ${providerId}:${propertyName} (position: ${result.queuePosition})`)
        }
        
        const error = new Error(`Rate limit exceeded for ${providerId}:${propertyName}`)
        ;(error as any).rateLimitInfo = result
        throw error
      }

      // Add adaptive delay if suggested
      if (result.adaptiveDelay) {
        await new Promise(resolve => setTimeout(resolve, result.adaptiveDelay))
      }

      try {
        const response = await method.apply(this, args)
        rateLimiter.recordSuccess(context)
        return response
      } catch (error: any) {
        // Classify and record error
        const errorType = error.message.toLowerCase().includes('rate limit') ? 'rate_limit' :
                         error.message.toLowerCase().includes('timeout') ? 'timeout' : 'server_error'
        rateLimiter.recordError(context, errorType)
        throw error
      }
    }

    return descriptor
  }
}

/**
 * Rate limiting middleware for Express-style APIs
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (req: any, res: any, next: any) => {
    const context: RequestContext = {
      providerId: config.providerId || 'api',
      userId: req.user?.id || req.ip,
      endpoint: req.path,
      priority: req.headers['x-priority'] || 'normal',
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    }

    try {
      const result = await rateLimiter.checkLimit(context)
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': config.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
      })

      if (!result.allowed) {
        if (result.retryAfter) {
          res.set('Retry-After', Math.ceil(result.retryAfter / 1000).toString())
        }
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
          queuePosition: result.queuePosition
        })
      }

      next()
    } catch (error) {
      console.error('Rate limit middleware error:', error)
      next() // Allow request to proceed on rate limiter error
    }
  }
}