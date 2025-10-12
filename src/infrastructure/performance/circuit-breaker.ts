import { EventEmitter } from 'events'

import { logger } from '@/lib/utils/logger'

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, rejecting requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  // Failure threshold
  failureThreshold: number // Number of failures to trigger open state
  failureRate: number // Percentage of failures to trigger open state
  minimumRequests: number // Minimum requests before evaluating failure rate
  
  // Timing
  timeout: number // Time to wait before trying half-open (ms)
  resetTimeout: number // Time to reset failure count (ms)
  
  // Half-open testing
  halfOpenMaxCalls: number // Max calls to test in half-open state
  successThreshold: number // Successful calls needed to close from half-open
  
  // Monitoring
  monitoringEnabled: boolean
  metricsWindow: number // Time window for metrics (ms)
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  totalRequests: number
  failureRate: number
  lastFailureTime?: number
  lastSuccessTime?: number
  stateChangedAt: number
  halfOpenAttempts: number
  consecutiveSuccesses: number
  timeInCurrentState: number
}

/**
 * Request execution result
 */
export interface ExecutionResult<T> {
  success: boolean
  result?: T
  error?: Error
  executionTime: number
  circuitState: CircuitState
}

/**
 * Fallback function type
 */
export type FallbackFunction<T> = (error: Error) => Promise<T> | T

/**
 * Error classifier function
 */
export type ErrorClassifier = (error: Error) => 'failure' | 'success' | 'ignore'

/**
 * Circuit breaker implementation for handling provider failures
 */
export class CircuitBreaker<T = any> extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED
  private config: CircuitBreakerConfig
  private stats: CircuitBreakerStats
  private lastAttemptTime = 0
  private stateChangeTime = Date.now()
  private requestLog: Array<{ timestamp: number; success: boolean; duration: number }> = []
  private resetTimer: NodeJS.Timeout | null = null
  private fallbackFn?: FallbackFunction<T>
  private errorClassifier?: ErrorClassifier

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    super()
    
    this.config = {
      failureThreshold: 5,
      failureRate: 50, // 50%
      minimumRequests: 10,
      timeout: 60000, // 1 minute
      resetTimeout: 300000, // 5 minutes
      halfOpenMaxCalls: 3,
      successThreshold: 2,
      monitoringEnabled: true,
      metricsWindow: 300000, // 5 minutes
      ...config
    }

    this.stats = {
      state: this.state,
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      failureRate: 0,
      stateChangedAt: this.stateChangeTime,
      halfOpenAttempts: 0,
      consecutiveSuccesses: 0,
      timeInCurrentState: 0
    }

    this.startResetTimer()
    
    logger.debug(`🔌 Circuit breaker initialized: ${name}`)
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<R = T>(fn: () => Promise<R>): Promise<R> {
    return this.call(fn)
  }

  /**
   * Call a function through the circuit breaker
   */
  async call<R = T>(fn: () => Promise<R>): Promise<R> {
    const startTime = Date.now()
    this.updateStats()

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen()
      } else {
        const error = new CircuitBreakerError(
          `Circuit breaker '${this.name}' is OPEN`,
          this.state,
          this.stats
        )
        
        if (this.fallbackFn) {
          logger.debug(`🔄 Circuit breaker OPEN, using fallback: ${this.name}`)
          return this.fallbackFn(error) as R
        }
        
        throw error
      }
    }

    // Check if we should allow call in half-open state
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
        const error = new CircuitBreakerError(
          `Circuit breaker '${this.name}' is HALF_OPEN and max attempts reached`,
          this.state,
          this.stats
        )
        
        if (this.fallbackFn) {
          return this.fallbackFn(error) as R
        }
        
        throw error
      }
      
      this.stats.halfOpenAttempts++
    }

    // Execute the function
    try {
      const result = await fn()
      const executionTime = Date.now() - startTime
      
      this.onSuccess(executionTime)
      this.emit('success', this.name, result, executionTime)
      
      return result
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      
      this.onFailure(error, executionTime)
      this.emit('failure', this.name, error, executionTime)
      
      if (this.fallbackFn) {
        logger.debug(`🔄 Circuit breaker fallback triggered: ${this.name}`)
        return this.fallbackFn(error) as R
      }
      
      throw error
    }
  }

  /**
   * Set fallback function
   */
  setFallback(fallback: FallbackFunction<T>): this {
    this.fallbackFn = fallback
    return this
  }

  /**
   * Set error classifier
   */
  setErrorClassifier(classifier: ErrorClassifier): this {
    this.errorClassifier = classifier
    return this
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * Force state change (for testing)
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state)
    logger.debug(`🔧 Circuit breaker force state: ${this.name} -> ${state}`)
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.stats.failureCount = 0
    this.stats.successCount = 0
    this.stats.totalRequests = 0
    this.stats.halfOpenAttempts = 0
    this.stats.consecutiveSuccesses = 0
    this.requestLog = []
    this.transitionTo(CircuitState.CLOSED)
    
    logger.debug(`🔄 Circuit breaker reset: ${this.name}`)
    this.emit('reset', this.name)
  }

  /**
   * Get health check result
   */
  healthCheck(): {
    healthy: boolean
    state: CircuitState
    failureRate: number
    lastFailure?: number
    recommendation: string
  } {
    this.updateStats()
    
    const healthy = this.state === CircuitState.CLOSED
    const recommendation = this.getHealthRecommendation()
    
    return {
      healthy,
      state: this.state,
      failureRate: this.stats.failureRate,
      lastFailure: this.stats.lastFailureTime,
      recommendation
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(executionTime: number): void {
    this.stats.successCount++
    this.stats.totalRequests++
    this.stats.lastSuccessTime = Date.now()
    this.stats.consecutiveSuccesses++
    
    this.addToRequestLog(true, executionTime)
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED)
      }
    }
    
    this.updateMetrics()
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error, executionTime: number): void {
    // Classify error
    const classification = this.errorClassifier ? this.errorClassifier(error) : 'failure'
    
    if (classification === 'ignore') {
      return // Don't count this as failure
    }
    
    if (classification === 'success') {
      this.onSuccess(executionTime)
      return
    }
    
    // Count as failure
    this.stats.failureCount++
    this.stats.totalRequests++
    this.stats.lastFailureTime = Date.now()
    this.stats.consecutiveSuccesses = 0
    
    this.addToRequestLog(false, executionTime)
    
    // Check if we should open the circuit
    if (this.shouldOpen()) {
      this.transitionTo(CircuitState.OPEN)
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Failures in half-open immediately go back to open
      this.transitionTo(CircuitState.OPEN)
    }
    
    this.updateMetrics()
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      return false
    }
    
    // Check failure threshold
    if (this.stats.failureCount >= this.config.failureThreshold) {
      return true
    }
    
    // Check failure rate (only if we have minimum requests)
    if (this.stats.totalRequests >= this.config.minimumRequests) {
      const recentFailureRate = this.calculateRecentFailureRate()
      if (recentFailureRate >= this.config.failureRate) {
        return true
      }
    }
    
    return false
  }

  /**
   * Check if we should attempt to reset (transition to half-open)
   */
  private shouldAttemptReset(): boolean {
    const timeSinceOpen = Date.now() - this.stateChangeTime
    return timeSinceOpen >= this.config.timeout
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    this.state = newState
    this.stateChangeTime = Date.now()
    this.stats.state = newState
    this.stats.stateChangedAt = this.stateChangeTime
    
    // Reset half-open specific counters
    if (newState !== CircuitState.HALF_OPEN) {
      this.stats.halfOpenAttempts = 0
    }
    
    if (newState === CircuitState.CLOSED) {
      this.stats.consecutiveSuccesses = 0
    }
    
    logger.debug(`🔄 Circuit breaker state change: ${this.name} ${oldState} -> ${newState}`)
    this.emit('stateChange', this.name, oldState, newState)
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    this.transitionTo(CircuitState.HALF_OPEN)
    this.stats.halfOpenAttempts = 0
    this.stats.consecutiveSuccesses = 0
  }

  /**
   * Calculate recent failure rate
   */
  private calculateRecentFailureRate(): number {
    const now = Date.now()
    const windowStart = now - this.config.metricsWindow
    
    const recentRequests = this.requestLog.filter(req => req.timestamp >= windowStart)
    
    if (recentRequests.length === 0) {
      return this.stats.failureRate
    }
    
    const failures = recentRequests.filter(req => !req.success).length
    return (failures / recentRequests.length) * 100
  }

  /**
   * Add request to log
   */
  private addToRequestLog(success: boolean, duration: number): void {
    if (!this.config.monitoringEnabled) return
    
    this.requestLog.push({
      timestamp: Date.now(),
      success,
      duration
    })
    
    // Keep only requests within metrics window
    const cutoff = Date.now() - this.config.metricsWindow
    this.requestLog = this.requestLog.filter(req => req.timestamp >= cutoff)
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.timeInCurrentState = Date.now() - this.stateChangeTime
    
    if (this.stats.totalRequests > 0) {
      this.stats.failureRate = (this.stats.failureCount / this.stats.totalRequests) * 100
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    // Clean old request log entries
    const cutoff = Date.now() - this.config.metricsWindow
    this.requestLog = this.requestLog.filter(req => req.timestamp >= cutoff)
  }

  /**
   * Get health recommendation
   */
  private getHealthRecommendation(): string {
    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.stats.failureRate > 20) {
          return 'Monitor closely - elevated failure rate'
        }
        return 'Healthy - operating normally'
      
      case CircuitState.HALF_OPEN:
        return 'Testing recovery - monitoring service health'
      
      case CircuitState.OPEN:
        const timeUntilRetry = this.config.timeout - (Date.now() - this.stateChangeTime)
        if (timeUntilRetry > 0) {
          return `Service failing - retry in ${Math.ceil(timeUntilRetry / 1000)}s`
        }
        return 'Ready to test recovery'
      
      default:
        return 'Unknown state'
    }
  }

  /**
   * Start reset timer
   */
  private startResetTimer(): void {
    this.resetTimer = setInterval(() => {
      if (this.state === CircuitState.CLOSED) {
        // Gradually reduce failure count in closed state
        if (this.stats.failureCount > 0) {
          this.stats.failureCount = Math.max(0, this.stats.failureCount - 1)
        }
      }
    }, this.config.resetTimeout)
  }

  /**
   * Shutdown circuit breaker
   */
  shutdown(): void {
    if (this.resetTimer) {
      clearInterval(this.resetTimer)
      this.resetTimer = null
    }
    
    this.removeAllListeners()
    logger.debug(`🛑 Circuit breaker shutdown: ${this.name}`)
  }
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public state: CircuitState,
    public stats: CircuitBreakerStats
  ) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry extends EventEmitter {
  private breakers = new Map<string, CircuitBreaker>()
  private globalConfig: Partial<CircuitBreakerConfig>
  private monitoringInterval: NodeJS.Timeout | null = null

  constructor(globalConfig: Partial<CircuitBreakerConfig> = {}) {
    super()
    this.globalConfig = globalConfig
    this.startMonitoring()
  }

  /**
   * Create or get circuit breaker
   */
  getOrCreate<T>(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker<T> {
    if (this.breakers.has(name)) {
      return this.breakers.get(name)! as CircuitBreaker<T>
    }

    const mergedConfig = { ...this.globalConfig, ...config }
    const breaker = new CircuitBreaker<T>(name, mergedConfig)
    
    // Forward events
    breaker.on('stateChange', (name, oldState, newState) => {
      this.emit('stateChange', name, oldState, newState)
    })
    
    breaker.on('failure', (name, error, duration) => {
      this.emit('failure', name, error, duration)
    })

    this.breakers.set(name, breaker as CircuitBreaker<any>)
    logger.debug(`🔌 Circuit breaker registered: ${name}`)
    
    return breaker
  }

  /**
   * Get circuit breaker
   */
  get<T>(name: string): CircuitBreaker<T> | null {
    return this.breakers.get(name) as CircuitBreaker<T> || null
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers)
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    const breaker = this.breakers.get(name)
    if (breaker) {
      breaker.shutdown()
      this.breakers.delete(name)
      logger.debug(`🗑️ Circuit breaker removed: ${name}`)
      return true
    }
    return false
  }

  /**
   * Get overall health status
   */
  getHealthStatus(): {
    total: number
    healthy: number
    degraded: number
    failed: number
    details: Array<{ name: string; state: CircuitState; failureRate: number }>
  } {
    const details = Array.from(this.breakers.entries()).map(([name, breaker]) => {
      const stats = breaker.getStats()
      return {
        name,
        state: stats.state,
        failureRate: stats.failureRate
      }
    })

    const total = details.length
    const healthy = details.filter(d => d.state === CircuitState.CLOSED && d.failureRate < 10).length
    const degraded = details.filter(d => d.state === CircuitState.HALF_OPEN || 
      (d.state === CircuitState.CLOSED && d.failureRate >= 10)).length
    const failed = details.filter(d => d.state === CircuitState.OPEN).length

    return { total, healthy, degraded, failed, details }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
    logger.debug(`🔄 All circuit breakers reset (${this.breakers.size} total)`)
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkHealth()
    }, 30000) // Check every 30 seconds
  }

  /**
   * Check health of all breakers
   */
  private checkHealth(): void {
    const status = this.getHealthStatus()
    
    if (status.failed > 0) {
      this.emit('healthAlert', {
        level: 'error',
        message: `${status.failed} circuit breakers are OPEN`,
        failed: status.failed,
        total: status.total
      })
    } else if (status.degraded > 0) {
      this.emit('healthAlert', {
        level: 'warning',
        message: `${status.degraded} circuit breakers are degraded`,
        degraded: status.degraded,
        total: status.total
      })
    }
  }

  /**
   * Shutdown registry
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    
    for (const breaker of this.breakers.values()) {
      breaker.shutdown()
    }
    
    this.breakers.clear()
    this.removeAllListeners()
    logger.debug('🛑 Circuit breaker registry shutdown')
  }
}

/**
 * Circuit breaker decorator for automatic protection
 */
export function CircuitBreak(options: {
  name?: string
  config?: Partial<CircuitBreakerConfig>
  fallback?: FallbackFunction<any>
  errorClassifier?: ErrorClassifier
} = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value
    const breakerName = options.name || `${target.constructor.name}.${propertyName}`
    
    descriptor.value = async function (this: any, ...args: any[]) {
      const breaker = circuitBreakerRegistry.getOrCreate(breakerName, options.config)
      
      if (options.fallback) {
        breaker.setFallback(options.fallback)
      }
      
      if (options.errorClassifier) {
        breaker.setErrorClassifier(options.errorClassifier)
      }
      
      return breaker.execute(() => method.apply(this, args))
    }

    return descriptor
  }
}

/**
 * Global circuit breaker registry
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry({
  failureThreshold: 5,
  failureRate: 50,
  minimumRequests: 10,
  timeout: 60000,
  resetTimeout: 300000,
  halfOpenMaxCalls: 3,
  successThreshold: 2,
  monitoringEnabled: true,
  metricsWindow: 300000
})

/**
 * Provider-specific circuit breaker helper
 */
export function createProviderCircuitBreaker(providerId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return circuitBreakerRegistry.getOrCreate(`provider:${providerId}`, {
    failureThreshold: 3, // Lower threshold for providers
    failureRate: 30, // Lower rate for providers
    timeout: 30000, // Shorter timeout
    ...config
  })
}

/**
 * Bulk circuit breaker operations
 */
export class BulkCircuitBreaker<T> {
  private breakers = new Map<string, CircuitBreaker<T>>()
  private defaultConfig: Partial<CircuitBreakerConfig>

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig
  }

  /**
   * Execute function across multiple services with circuit breaking
   */
  async executeAll(
    operations: Array<{ key: string; fn: () => Promise<T>; config?: Partial<CircuitBreakerConfig> }>,
    options: {
      failFast?: boolean // Fail immediately if any circuit is open
      maxConcurrency?: number
      timeout?: number
    } = {}
  ): Promise<Array<{ key: string; result?: T; error?: Error; circuitState: CircuitState }>> {
    const results: Array<{ key: string; result?: T; error?: Error; circuitState: CircuitState }> = []
    
    // Create or get circuit breakers
    for (const op of operations) {
      if (!this.breakers.has(op.key)) {
        const config = { ...this.defaultConfig, ...op.config }
        this.breakers.set(op.key, new CircuitBreaker(op.key, config))
      }
    }

    // Check for open circuits if fail fast is enabled
    if (options.failFast) {
      for (const op of operations) {
        const breaker = this.breakers.get(op.key)!
        if (breaker.getState() === CircuitState.OPEN) {
          throw new Error(`Circuit breaker '${op.key}' is OPEN - failing fast`)
        }
      }
    }

    // Execute operations
    const promises = operations.map(async (op) => {
      const breaker = this.breakers.get(op.key)!
      
      try {
        const result = await breaker.execute(op.fn)
        return {
          key: op.key,
          result,
          circuitState: breaker.getState()
        }
      } catch (error: any) {
        return {
          key: op.key,
          error,
          circuitState: breaker.getState()
        }
      }
    })

    // Handle concurrency limit
    if (options.maxConcurrency) {
      const chunks = []
      for (let i = 0; i < promises.length; i += options.maxConcurrency) {
        chunks.push(promises.slice(i, i + options.maxConcurrency))
      }
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(chunk)
        results.push(...chunkResults.map(r => r.status === 'fulfilled' ? r.value : r.reason))
      }
    } else {
      const allResults = await Promise.allSettled(promises)
      results.push(...allResults.map(r => r.status === 'fulfilled' ? r.value : r.reason))
    }

    return results
  }

  /**
   * Get health status for all breakers
   */
  getHealthStatus(): Map<string, { state: CircuitState; stats: CircuitBreakerStats }> {
    const status = new Map<string, { state: CircuitState; stats: CircuitBreakerStats }>()
    
    for (const [key, breaker] of this.breakers.entries()) {
      status.set(key, {
        state: breaker.getState(),
        stats: breaker.getStats()
      })
    }
    
    return status
  }

  /**
   * Shutdown all breakers
   */
  shutdown(): void {
    for (const breaker of this.breakers.values()) {
      breaker.shutdown()
    }
    this.breakers.clear()
  }
}