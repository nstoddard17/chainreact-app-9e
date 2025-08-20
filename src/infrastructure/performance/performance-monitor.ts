import { EventEmitter } from 'events'

/**
 * Performance metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

/**
 * Performance metric data point
 */
export interface MetricDataPoint {
  timestamp: number
  value: number
  labels?: Record<string, string>
  metadata?: Record<string, any>
}

/**
 * Metric configuration
 */
export interface MetricConfig {
  name: string
  type: MetricType
  description?: string
  unit?: string
  labels?: string[]
  retention?: number // How long to keep data (ms)
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count'
}

/**
 * Performance statistics
 */
export interface PerformanceStats {
  requestCount: number
  successCount: number
  errorCount: number
  averageResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  throughput: number // requests per second
  errorRate: number // percentage
  availability: number // percentage
}

/**
 * Provider performance metrics
 */
export interface ProviderMetrics {
  providerId: string
  stats: PerformanceStats
  timeSeries: MetricDataPoint[]
  lastUpdated: number
  healthScore: number // 0-100
}

/**
 * Performance alert configuration
 */
export interface AlertConfig {
  name: string
  metric: string
  threshold: number
  comparison: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  duration: number // ms - how long condition must persist
  cooldown: number // ms - minimum time between alerts
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string
  config: AlertConfig
  triggeredAt: number
  value: number
  message: string
  acknowledged: boolean
  resolvedAt?: number
}

/**
 * Comprehensive performance monitoring system
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics = new Map<string, MetricDataPoint[]>()
  private metricConfigs = new Map<string, MetricConfig>()
  private providerMetrics = new Map<string, ProviderMetrics>()
  private alerts = new Map<string, PerformanceAlert>()
  private alertConfigs = new Map<string, AlertConfig>()
  private requestTimings = new Map<string, number>() // Track request start times
  private cleanupInterval: NodeJS.Timeout
  private alertCheckInterval: NodeJS.Timeout
  private metricsInterval: NodeJS.Timeout

  constructor() {
    super()
    
    // Initialize default metrics
    this.initializeDefaultMetrics()
    
    // Start background tasks
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000) // 5 minutes
    this.alertCheckInterval = setInterval(() => this.checkAlerts(), 10000) // 10 seconds
    this.metricsInterval = setInterval(() => this.calculateMetrics(), 5000) // 5 seconds
    
    console.log('📊 Performance monitor initialized')
  }

  /**
   * Register a metric for tracking
   */
  registerMetric(config: MetricConfig): void {
    this.metricConfigs.set(config.name, config)
    
    if (!this.metrics.has(config.name)) {
      this.metrics.set(config.name, [])
    }
    
    console.log(`📈 Metric registered: ${config.name} (${config.type})`)
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, labels?: Record<string, string>, metadata?: Record<string, any>): void {
    const config = this.metricConfigs.get(name)
    if (!config) {
      console.warn(`⚠️ Unknown metric: ${name}`)
      return
    }

    const dataPoint: MetricDataPoint = {
      timestamp: Date.now(),
      value,
      labels,
      metadata
    }

    const metricData = this.metrics.get(name)!
    metricData.push(dataPoint)

    // Limit data points based on retention
    if (config.retention) {
      const cutoff = Date.now() - config.retention
      const filtered = metricData.filter(dp => dp.timestamp >= cutoff)
      this.metrics.set(name, filtered)
    }

    this.emit('metric', name, dataPoint)
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, providerId: string, operation: string): void {
    this.requestTimings.set(requestId, Date.now())
    
    this.recordMetric('request_started', 1, {
      providerId,
      operation
    })
  }

  /**
   * Complete a request successfully
   */
  completeRequest(requestId: string, providerId: string, operation: string, metadata?: Record<string, any>): void {
    const startTime = this.requestTimings.get(requestId)
    if (!startTime) {
      console.warn(`⚠️ No start time found for request: ${requestId}`)
      return
    }

    const duration = Date.now() - startTime
    this.requestTimings.delete(requestId)

    this.recordMetric('request_completed', 1, { providerId, operation })
    this.recordMetric('request_duration', duration, { providerId, operation }, metadata)
    this.recordMetric('request_success', 1, { providerId, operation })

    this.updateProviderMetrics(providerId, 'success', duration)
    
    console.log(`✅ Request completed: ${requestId} (${duration}ms)`)
  }

  /**
   * Record a request failure
   */
  failRequest(requestId: string, providerId: string, operation: string, error: Error): void {
    const startTime = this.requestTimings.get(requestId)
    const duration = startTime ? Date.now() - startTime : 0
    this.requestTimings.delete(requestId)

    this.recordMetric('request_failed', 1, { 
      providerId, 
      operation,
      errorType: this.classifyError(error)
    })
    
    if (duration > 0) {
      this.recordMetric('request_duration', duration, { providerId, operation, result: 'error' })
    }

    this.updateProviderMetrics(providerId, 'error', duration)
    
    console.log(`❌ Request failed: ${requestId} (${error.message})`)
  }

  /**
   * Record rate limit hit
   */
  recordRateLimit(providerId: string, operation: string): void {
    this.recordMetric('rate_limit_hit', 1, { providerId, operation })
    console.log(`🚦 Rate limit hit: ${providerId}:${operation}`)
  }

  /**
   * Record cache hit/miss
   */
  recordCacheEvent(providerId: string, operation: string, hit: boolean): void {
    this.recordMetric('cache_event', 1, { 
      providerId, 
      operation, 
      result: hit ? 'hit' : 'miss' 
    })
  }

  /**
   * Get metrics for a specific metric name
   */
  getMetric(name: string, timeRange?: { start: number; end: number }): MetricDataPoint[] {
    const data = this.metrics.get(name) || []
    
    if (!timeRange) {
      return [...data]
    }
    
    return data.filter(dp => 
      dp.timestamp >= timeRange.start && dp.timestamp <= timeRange.end
    )
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(name: string, aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count', timeRange?: { start: number; end: number }): number {
    const data = this.getMetric(name, timeRange)
    
    if (data.length === 0) return 0
    
    const values = data.map(dp => dp.value)
    
    switch (aggregation) {
      case 'sum': return values.reduce((a, b) => a + b, 0)
      case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
      case 'min': return Math.min(...values)
      case 'max': return Math.max(...values)
      case 'count': return values.length
      default: return 0
    }
  }

  /**
   * Get provider performance metrics
   */
  getProviderMetrics(providerId: string): ProviderMetrics | null {
    return this.providerMetrics.get(providerId) || null
  }

  /**
   * Get all provider metrics
   */
  getAllProviderMetrics(): Map<string, ProviderMetrics> {
    return new Map(this.providerMetrics)
  }

  /**
   * Get performance statistics for a time range
   */
  getPerformanceStats(providerId?: string, timeRange?: { start: number; end: number }): PerformanceStats {
    const labels = providerId ? { providerId } : undefined
    const now = Date.now()
    const defaultTimeRange = { start: now - 300000, end: now } // Last 5 minutes
    const range = timeRange || defaultTimeRange

    // Get raw metrics
    const completedRequests = this.getMetricData('request_completed', labels, range)
    const failedRequests = this.getMetricData('request_failed', labels, range)
    const durations = this.getMetricData('request_duration', labels, range)

    const totalRequests = completedRequests.length + failedRequests.length
    const successCount = completedRequests.length
    const errorCount = failedRequests.length

    // Calculate response times
    const durationValues = durations.map(d => d.value).sort((a, b) => a - b)
    const averageResponseTime = durationValues.length > 0 
      ? durationValues.reduce((a, b) => a + b, 0) / durationValues.length 
      : 0
    
    const p95Index = Math.ceil(durationValues.length * 0.95) - 1
    const p99Index = Math.ceil(durationValues.length * 0.99) - 1
    const p95ResponseTime = durationValues[p95Index] || 0
    const p99ResponseTime = durationValues[p99Index] || 0

    // Calculate throughput (requests per second)
    const timeSpan = (range.end - range.start) / 1000
    const throughput = timeSpan > 0 ? totalRequests / timeSpan : 0

    // Calculate error rate
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0

    // Calculate availability
    const availability = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100

    return {
      requestCount: totalRequests,
      successCount,
      errorCount,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      throughput,
      errorRate,
      availability
    }
  }

  /**
   * Configure performance alert
   */
  configureAlert(config: AlertConfig): void {
    this.alertConfigs.set(config.name, config)
    console.log(`🚨 Alert configured: ${config.name}`)
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolvedAt)
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId)
    if (alert) {
      alert.acknowledged = true
      this.emit('alertAcknowledged', alert)
      console.log(`✅ Alert acknowledged: ${alertId}`)
    }
  }

  /**
   * Get performance dashboard data
   */
  getDashboardData(): {
    overview: PerformanceStats
    providers: Array<ProviderMetrics>
    alerts: PerformanceAlert[]
    topMetrics: Array<{ name: string; value: number; trend: number }>
  } {
    const overview = this.getPerformanceStats()
    const providers = Array.from(this.providerMetrics.values())
    const alerts = this.getActiveAlerts()
    
    const topMetrics = [
      {
        name: 'Total Requests',
        value: overview.requestCount,
        trend: this.calculateTrend('request_completed')
      },
      {
        name: 'Average Response Time',
        value: overview.averageResponseTime,
        trend: this.calculateTrend('request_duration')
      },
      {
        name: 'Error Rate',
        value: overview.errorRate,
        trend: this.calculateTrend('request_failed')
      },
      {
        name: 'Throughput',
        value: overview.throughput,
        trend: this.calculateTrend('request_completed', 'throughput')
      }
    ]

    return { overview, providers, alerts, topMetrics }
  }

  /**
   * Initialize default metrics
   */
  private initializeDefaultMetrics(): void {
    const defaultMetrics: MetricConfig[] = [
      { name: 'request_started', type: 'counter', description: 'Total requests started', unit: 'count' },
      { name: 'request_completed', type: 'counter', description: 'Total requests completed', unit: 'count' },
      { name: 'request_failed', type: 'counter', description: 'Total requests failed', unit: 'count' },
      { name: 'request_duration', type: 'histogram', description: 'Request duration', unit: 'ms' },
      { name: 'request_success', type: 'counter', description: 'Successful requests', unit: 'count' },
      { name: 'rate_limit_hit', type: 'counter', description: 'Rate limit hits', unit: 'count' },
      { name: 'cache_event', type: 'counter', description: 'Cache hits/misses', unit: 'count' },
      { name: 'provider_health', type: 'gauge', description: 'Provider health score', unit: 'score' },
      { name: 'queue_size', type: 'gauge', description: 'Request queue size', unit: 'count' },
      { name: 'concurrent_requests', type: 'gauge', description: 'Concurrent requests', unit: 'count' }
    ]

    for (const metric of defaultMetrics) {
      this.registerMetric(metric)
    }
  }

  /**
   * Update provider-specific metrics
   */
  private updateProviderMetrics(providerId: string, result: 'success' | 'error', duration: number): void {
    if (!this.providerMetrics.has(providerId)) {
      this.providerMetrics.set(providerId, {
        providerId,
        stats: {
          requestCount: 0,
          successCount: 0,
          errorCount: 0,
          averageResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          throughput: 0,
          errorRate: 0,
          availability: 0
        },
        timeSeries: [],
        lastUpdated: Date.now(),
        healthScore: 100
      })
    }

    const metrics = this.providerMetrics.get(providerId)!
    
    // Update counters
    metrics.stats.requestCount++
    if (result === 'success') {
      metrics.stats.successCount++
    } else {
      metrics.stats.errorCount++
    }

    // Update response time
    const totalRequests = metrics.stats.requestCount
    metrics.stats.averageResponseTime = (
      (metrics.stats.averageResponseTime * (totalRequests - 1)) + duration
    ) / totalRequests

    // Update error rate and availability
    metrics.stats.errorRate = (metrics.stats.errorCount / totalRequests) * 100
    metrics.stats.availability = (metrics.stats.successCount / totalRequests) * 100

    // Calculate health score
    metrics.healthScore = this.calculateHealthScore(metrics.stats)
    metrics.lastUpdated = Date.now()

    // Add to time series
    metrics.timeSeries.push({
      timestamp: Date.now(),
      value: result === 'success' ? 1 : 0,
      labels: { result },
      metadata: { duration }
    })

    // Limit time series data
    if (metrics.timeSeries.length > 1000) {
      metrics.timeSeries = metrics.timeSeries.slice(-1000)
    }
  }

  /**
   * Calculate health score for a provider
   */
  private calculateHealthScore(stats: PerformanceStats): number {
    let score = 100

    // Penalize high error rate
    score -= stats.errorRate * 2 // -2 points per percent error rate

    // Penalize slow response times
    if (stats.averageResponseTime > 5000) { // > 5 seconds
      score -= 30
    } else if (stats.averageResponseTime > 2000) { // > 2 seconds
      score -= 15
    } else if (stats.averageResponseTime > 1000) { // > 1 second
      score -= 5
    }

    // Penalize low availability
    if (stats.availability < 99) {
      score -= (99 - stats.availability) * 5
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * Get metric data with filtering
   */
  private getMetricData(name: string, labels?: Record<string, string>, timeRange?: { start: number; end: number }): MetricDataPoint[] {
    let data = this.getMetric(name, timeRange)
    
    if (labels) {
      data = data.filter(dp => {
        if (!dp.labels) return false
        return Object.entries(labels).every(([key, value]) => dp.labels![key] === value)
      })
    }
    
    return data
  }

  /**
   * Calculate trend for a metric
   */
  private calculateTrend(metricName: string, type: 'value' | 'throughput' = 'value'): number {
    const now = Date.now()
    const current = this.getMetricData(metricName, undefined, { start: now - 300000, end: now })
    const previous = this.getMetricData(metricName, undefined, { start: now - 600000, end: now - 300000 })

    if (previous.length === 0) return 0

    let currentValue: number, previousValue: number

    if (type === 'throughput') {
      currentValue = current.length / 300 // per second over 5 minutes
      previousValue = previous.length / 300
    } else {
      currentValue = current.reduce((sum, dp) => sum + dp.value, 0)
      previousValue = previous.reduce((sum, dp) => sum + dp.value, 0)
    }

    if (previousValue === 0) return 0
    return ((currentValue - previousValue) / previousValue) * 100
  }

  /**
   * Check alerts
   */
  private checkAlerts(): void {
    for (const [name, config] of this.alertConfigs.entries()) {
      if (!config.enabled) continue

      const value = this.getAggregatedMetrics(config.metric, 'avg', {
        start: Date.now() - config.duration,
        end: Date.now()
      })

      const shouldTrigger = this.shouldTriggerAlert(config, value)
      const existingAlert = this.alerts.get(name)

      if (shouldTrigger && !existingAlert) {
        this.triggerAlert(config, value)
      } else if (!shouldTrigger && existingAlert && !existingAlert.resolvedAt) {
        this.resolveAlert(name)
      }
    }
  }

  /**
   * Check if alert should trigger
   */
  private shouldTriggerAlert(config: AlertConfig, value: number): boolean {
    switch (config.comparison) {
      case 'gt': return value > config.threshold
      case 'lt': return value < config.threshold
      case 'eq': return value === config.threshold
      case 'gte': return value >= config.threshold
      case 'lte': return value <= config.threshold
      default: return false
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(config: AlertConfig, value: number): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      config,
      triggeredAt: Date.now(),
      value,
      message: `${config.name}: ${config.metric} is ${value} (threshold: ${config.threshold})`,
      acknowledged: false
    }

    this.alerts.set(config.name, alert)
    this.emit('alertTriggered', alert)
    
    console.log(`🚨 Alert triggered: ${alert.message}`)
  }

  /**
   * Resolve an alert
   */
  private resolveAlert(name: string): void {
    const alert = this.alerts.get(name)
    if (alert) {
      alert.resolvedAt = Date.now()
      this.emit('alertResolved', alert)
      console.log(`✅ Alert resolved: ${name}`)
    }
  }

  /**
   * Classify error for metrics
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase()
    
    if (message.includes('timeout')) return 'timeout'
    if (message.includes('rate limit')) return 'rate_limit'
    if (message.includes('unauthorized')) return 'auth'
    if (message.includes('forbidden')) return 'permission'
    if (message.includes('not found')) return 'not_found'
    if (message.includes('network')) return 'network'
    
    return 'unknown'
  }

  /**
   * Calculate metrics periodically
   */
  private calculateMetrics(): void {
    // Update queue size metrics
    const queueSizeTotal = Array.from(require('../rate-limiting/request-queue').queues.values())
      .reduce((total, queue) => total + queue.size(), 0)
    
    this.recordMetric('queue_size', queueSizeTotal)

    // Update concurrent requests
    const concurrentRequests = this.requestTimings.size
    this.recordMetric('concurrent_requests', concurrentRequests)

    // Update provider health metrics
    for (const [providerId, metrics] of this.providerMetrics.entries()) {
      this.recordMetric('provider_health', metrics.healthScore, { providerId })
    }
  }

  /**
   * Cleanup old data
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    // Clean up old metric data
    for (const [name, config] of this.metricConfigs.entries()) {
      if (config.retention) {
        const data = this.metrics.get(name)
        if (data) {
          const cutoff = now - config.retention
          const filtered = data.filter(dp => dp.timestamp >= cutoff)
          this.metrics.set(name, filtered)
          cleaned += data.length - filtered.length
        }
      }
    }

    // Clean up old request timings
    const staleTimings = Array.from(this.requestTimings.entries())
      .filter(([_, startTime]) => now - startTime > 300000) // 5 minutes
    
    for (const [requestId] of staleTimings) {
      this.requestTimings.delete(requestId)
    }

    // Clean up resolved alerts older than 24 hours
    const staleAlerts = Array.from(this.alerts.entries())
      .filter(([_, alert]) => alert.resolvedAt && now - alert.resolvedAt > 86400000)
    
    for (const [name] of staleAlerts) {
      this.alerts.delete(name)
    }

    if (cleaned > 0) {
      console.log(`🧹 Performance monitor cleanup: ${cleaned} data points, ${staleTimings.length} timings, ${staleAlerts.length} alerts`)
    }
  }

  /**
   * Shutdown the performance monitor
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval)
    clearInterval(this.alertCheckInterval)
    clearInterval(this.metricsInterval)
    
    this.metrics.clear()
    this.providerMetrics.clear()
    this.requestTimings.clear()
    this.alerts.clear()
    
    console.log('🛑 Performance monitor shutdown complete')
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor()

/**
 * Performance monitoring decorator
 */
export function Monitor(metricName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value
    const name = metricName || `${target.constructor.name}.${propertyName}`

    descriptor.value = async function (this: any, ...args: any[]) {
      const requestId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const providerId = this.providerId || 'unknown'
      
      performanceMonitor.startRequest(requestId, providerId, propertyName)

      try {
        const result = await method.apply(this, args)
        performanceMonitor.completeRequest(requestId, providerId, propertyName, { success: true })
        return result
      } catch (error: any) {
        performanceMonitor.failRequest(requestId, providerId, propertyName, error)
        throw error
      }
    }

    return descriptor
  }
}