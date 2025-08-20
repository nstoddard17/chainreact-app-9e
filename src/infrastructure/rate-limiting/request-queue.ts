import { EventEmitter } from 'events'

/**
 * Request queue configuration
 */
export interface QueueConfig {
  maxSize: number
  maxConcurrency: number
  retryAttempts: number
  retryDelay: number
  backoffMultiplier: number
  timeout: number
  priority: boolean
  fifo: boolean // First In, First Out vs Priority Queue
}

/**
 * Queued request item
 */
export interface QueuedRequest<T = any> {
  id: string
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
  priority: number
  attempts: number
  maxAttempts: number
  createdAt: number
  retryDelay: number
  timeout: number
  metadata?: Record<string, any>
}

/**
 * Queue statistics
 */
export interface QueueStats {
  queued: number
  processing: number
  completed: number
  failed: number
  retries: number
  averageWaitTime: number
  averageProcessingTime: number
  maxWaitTime: number
  throughput: number // requests per second
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  attempts: number
  delay: number
  backoffMultiplier: number
  jitter: boolean
  retryCondition?: (error: Error) => boolean
}

/**
 * Intelligent request queue with priority, retry, and concurrency control
 */
export class RequestQueue<T = any> extends EventEmitter {
  private queue: QueuedRequest<T>[] = []
  private processing = new Set<string>()
  private config: QueueConfig
  private stats: QueueStats
  private processingInterval: NodeJS.Timeout | null = null
  private metricsInterval: NodeJS.Timeout | null = null
  private lastThroughputCheck = Date.now()
  private throughputCounter = 0

  constructor(config: Partial<QueueConfig> = {}) {
    super()
    
    this.config = {
      maxSize: 1000,
      maxConcurrency: 10,
      retryAttempts: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      timeout: 30000,
      priority: true,
      fifo: true,
      ...config
    }

    this.stats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retries: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      maxWaitTime: 0,
      throughput: 0
    }

    this.startProcessing()
    this.startMetrics()
  }

  /**
   * Add a request to the queue
   */
  async enqueue<R = T>(
    fn: () => Promise<R>,
    options: {
      priority?: number
      timeout?: number
      retryConfig?: Partial<RetryConfig>
      metadata?: Record<string, any>
    } = {}
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this.queue.length >= this.config.maxSize) {
        const error = new Error(`Queue full (${this.config.maxSize} items)`)
        ;(error as any).code = 'QUEUE_FULL'
        reject(error)
        return
      }

      const request: QueuedRequest<R> = {
        id: this.generateId(),
        fn: fn as () => Promise<any>,
        resolve: resolve as (value: any) => void,
        reject,
        priority: options.priority ?? 5,
        attempts: 0,
        maxAttempts: options.retryConfig?.attempts ?? this.config.retryAttempts,
        createdAt: Date.now(),
        retryDelay: options.retryConfig?.delay ?? this.config.retryDelay,
        timeout: options.timeout ?? this.config.timeout,
        metadata: options.metadata
      }

      // Add to queue with priority sorting
      if (this.config.priority) {
        this.insertByPriority(request)
      } else {
        this.queue.push(request)
      }

      this.stats.queued++
      this.emit('enqueued', request)
      
      console.log(`📝 Request queued: ${request.id} (priority: ${request.priority}, queue size: ${this.queue.length})`)
    })
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return { 
      ...this.stats,
      processing: this.processing.size,
      queued: this.queue.length
    }
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.queue.length
  }

  /**
   * Get processing count
   */
  processingCount(): number {
    return this.processing.size
  }

  /**
   * Clear the queue
   */
  clear(): void {
    const cleared = this.queue.length
    
    // Reject all queued requests
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'))
    }
    
    this.queue = []
    console.log(`🗑️ Queue cleared: ${cleared} requests rejected`)
    this.emit('cleared', cleared)
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
      console.log('⏸️ Queue processing paused')
      this.emit('paused')
    }
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    if (!this.processingInterval) {
      this.startProcessing()
      console.log('▶️ Queue processing resumed')
      this.emit('resumed')
    }
  }

  /**
   * Shutdown the queue
   */
  shutdown(): void {
    this.pause()
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
      this.metricsInterval = null
    }
    
    this.clear()
    console.log('🛑 Request queue shutdown complete')
    this.emit('shutdown')
  }

  /**
   * Start processing queue items
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processNext()
    }, 10) // Check every 10ms for responsive processing
  }

  /**
   * Start metrics collection
   */
  private startMetrics(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics()
    }, 1000) // Update metrics every second
  }

  /**
   * Process next item in queue
   */
  private async processNext(): Promise<void> {
    // Check if we can process more requests
    if (this.processing.size >= this.config.maxConcurrency || this.queue.length === 0) {
      return
    }

    const request = this.queue.shift()
    if (!request) return

    this.processing.add(request.id)
    this.stats.processing = this.processing.size

    try {
      await this.executeRequest(request)
    } catch (error) {
      console.error(`❌ Error processing request ${request.id}:`, error)
    } finally {
      this.processing.delete(request.id)
      this.stats.processing = this.processing.size
    }
  }

  /**
   * Execute a queued request with timeout and retry logic
   */
  private async executeRequest<R>(request: QueuedRequest<R>): Promise<void> {
    const startTime = Date.now()
    request.attempts++

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${request.timeout}ms`))
        }, request.timeout)
      })

      // Execute with timeout
      const result = await Promise.race([
        request.fn(),
        timeoutPromise
      ])

      // Success
      const processingTime = Date.now() - startTime
      const waitTime = startTime - request.createdAt
      
      this.updateSuccessMetrics(waitTime, processingTime)
      this.throughputCounter++
      
      request.resolve(result)
      this.emit('completed', request, result)
      
      console.log(`✅ Request completed: ${request.id} (wait: ${waitTime}ms, processing: ${processingTime}ms)`)

    } catch (error: any) {
      const shouldRetry = this.shouldRetry(request, error)
      
      if (shouldRetry) {
        // Retry with backoff
        this.stats.retries++
        const delay = this.calculateRetryDelay(request)
        
        console.log(`🔄 Retrying request ${request.id} in ${delay}ms (attempt ${request.attempts}/${request.maxAttempts})`)
        
        setTimeout(() => {
          // Re-add to queue for retry
          if (this.config.priority) {
            this.insertByPriority(request)
          } else {
            this.queue.unshift(request) // Add to front for immediate retry
          }
        }, delay)
        
        this.emit('retry', request, error)
      } else {
        // Final failure
        this.stats.failed++
        request.reject(error)
        this.emit('failed', request, error)
        
        console.log(`❌ Request failed permanently: ${request.id} (${error.message})`)
      }
    }
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry<R>(request: QueuedRequest<R>, error: Error): boolean {
    if (request.attempts >= request.maxAttempts) {
      return false
    }

    // Don't retry timeout errors by default
    if (error.message.includes('timeout')) {
      return false
    }

    // Don't retry authentication errors
    if (error.message.toLowerCase().includes('unauthorized') || 
        error.message.toLowerCase().includes('forbidden')) {
      return false
    }

    // Don't retry validation errors
    if (error.message.toLowerCase().includes('invalid') || 
        error.message.toLowerCase().includes('bad request')) {
      return false
    }

    // Retry rate limits, network errors, and server errors
    return true
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay<R>(request: QueuedRequest<R>): number {
    const baseDelay = request.retryDelay
    const backoffDelay = baseDelay * Math.pow(this.config.backoffMultiplier, request.attempts - 1)
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * backoffDelay
    
    return Math.min(backoffDelay + jitter, 30000) // Max 30 second delay
  }

  /**
   * Insert request by priority (higher number = higher priority)
   */
  private insertByPriority<R>(request: QueuedRequest<R>): void {
    if (this.queue.length === 0) {
      this.queue.push(request)
      return
    }

    // Find insertion point
    let insertIndex = 0
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < request.priority) {
        insertIndex = i
        break
      }
      insertIndex = i + 1
    }

    this.queue.splice(insertIndex, 0, request)
  }

  /**
   * Update success metrics
   */
  private updateSuccessMetrics(waitTime: number, processingTime: number): void {
    this.stats.completed++
    
    // Update average wait time
    const totalCompleted = this.stats.completed
    this.stats.averageWaitTime = (this.stats.averageWaitTime * (totalCompleted - 1) + waitTime) / totalCompleted
    
    // Update average processing time
    this.stats.averageProcessingTime = (this.stats.averageProcessingTime * (totalCompleted - 1) + processingTime) / totalCompleted
    
    // Update max wait time
    this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime)
  }

  /**
   * Update throughput metrics
   */
  private updateMetrics(): void {
    const now = Date.now()
    const timeDiff = now - this.lastThroughputCheck
    
    if (timeDiff >= 1000) { // Update every second
      this.stats.throughput = (this.throughputCounter / timeDiff) * 1000 // requests per second
      this.throughputCounter = 0
      this.lastThroughputCheck = now
    }
  }

  /**
   * Generate unique request ID
   */
  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Retry utility function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = { attempts: 3, delay: 1000, backoffMultiplier: 2, jitter: true }
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= config.attempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      // Check if we should retry this error
      if (config.retryCondition && !config.retryCondition(error)) {
        throw error
      }
      
      // Don't retry on last attempt
      if (attempt === config.attempts) {
        break
      }
      
      // Calculate delay
      let delay = config.delay * Math.pow(config.backoffMultiplier, attempt - 1)
      
      // Add jitter
      if (config.jitter) {
        delay = delay + (Math.random() * 0.1 * delay)
      }
      
      console.log(`🔄 Retrying operation in ${Math.round(delay)}ms (attempt ${attempt}/${config.attempts})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

/**
 * Batch processing utility
 */
export class BatchProcessor<T, R> {
  private queue: RequestQueue<R[]>
  private batchSize: number
  private batchTimeout: number
  private currentBatch: Array<{ item: T; resolve: (value: R) => void; reject: (error: Error) => void }> = []
  private batchTimer: NodeJS.Timeout | null = null

  constructor(
    private processor: (batch: T[]) => Promise<R[]>,
    options: {
      batchSize?: number
      batchTimeout?: number
      queueConfig?: Partial<QueueConfig>
    } = {}
  ) {
    this.batchSize = options.batchSize || 10
    this.batchTimeout = options.batchTimeout || 1000
    this.queue = new RequestQueue<R[]>(options.queueConfig)
  }

  /**
   * Add item to batch for processing
   */
  async process(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.currentBatch.push({ item, resolve, reject })
      
      // Process batch if it's full
      if (this.currentBatch.length >= this.batchSize) {
        this.processBatch()
      } else {
        // Set timer for partial batch
        this.resetBatchTimer()
      }
    })
  }

  /**
   * Process current batch
   */
  private async processBatch(): Promise<void> {
    if (this.currentBatch.length === 0) return
    
    const batch = this.currentBatch
    this.currentBatch = []
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    try {
      // Queue the batch for processing
      await this.queue.enqueue(async () => {
        const items = batch.map(b => b.item)
        const results = await this.processor(items)
        
        // Resolve individual promises
        for (let i = 0; i < batch.length; i++) {
          if (results[i] !== undefined) {
            batch[i].resolve(results[i])
          } else {
            batch[i].reject(new Error(`No result for batch item ${i}`))
          }
        }
        
        return results
      })
    } catch (error: any) {
      // Reject all items in failed batch
      for (const item of batch) {
        item.reject(error)
      }
    }
  }

  /**
   * Reset batch timer
   */
  private resetBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }
    
    this.batchTimer = setTimeout(() => {
      this.processBatch()
    }, this.batchTimeout)
  }

  /**
   * Flush any pending batches
   */
  async flush(): Promise<void> {
    if (this.currentBatch.length > 0) {
      await this.processBatch()
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats & { currentBatchSize: number } {
    return {
      ...this.queue.getStats(),
      currentBatchSize: this.currentBatch.length
    }
  }

  /**
   * Shutdown the batch processor
   */
  shutdown(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }
    
    // Reject pending batch items
    for (const item of this.currentBatch) {
      item.reject(new Error('Batch processor shutting down'))
    }
    
    this.queue.shutdown()
  }
}

/**
 * Global request queue instances for different priorities
 */
export const queues = {
  critical: new RequestQueue({ maxConcurrency: 20, retryAttempts: 5 }),
  high: new RequestQueue({ maxConcurrency: 15, retryAttempts: 3 }),
  normal: new RequestQueue({ maxConcurrency: 10, retryAttempts: 3 }),
  low: new RequestQueue({ maxConcurrency: 5, retryAttempts: 2 })
}

/**
 * Helper function to get appropriate queue for priority
 */
export function getQueue(priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'): RequestQueue {
  return queues[priority]
}