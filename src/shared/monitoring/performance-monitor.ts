/**
 * Performance monitoring and metrics collection
 */

export interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'count' | 'bytes' | 'percent'
  timestamp: Date
  tags?: Record<string, string>
}

export interface ErrorMetric {
  errorType: string
  providerId?: string
  actionType?: string
  count: number
  lastOccurred: Date
  examples: Array<{
    message: string
    stack?: string
    timestamp: Date
  }>
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private errors: Map<string, ErrorMetric> = new Map()
  private maxMetrics = 10000
  private maxErrorExamples = 5

  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    value: number,
    unit: 'ms' | 'count' | 'bytes' | 'percent' = 'count',
    tags?: Record<string, string>
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    }

    this.metrics.push(metric)

    // Keep metrics within limit
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }
  }

  /**
   * Record an error occurrence
   */
  recordError(
    errorType: string,
    message: string,
    providerId?: string,
    actionType?: string,
    stack?: string
  ): void {
    const key = `${errorType}:${providerId || 'unknown'}:${actionType || 'unknown'}`
    
    let errorMetric = this.errors.get(key)
    if (!errorMetric) {
      errorMetric = {
        errorType,
        providerId,
        actionType,
        count: 0,
        lastOccurred: new Date(),
        examples: []
      }
      this.errors.set(key, errorMetric)
    }

    errorMetric.count++
    errorMetric.lastOccurred = new Date()

    // Add example if we haven't reached the limit
    if (errorMetric.examples.length < this.maxErrorExamples) {
      errorMetric.examples.push({
        message,
        stack,
        timestamp: new Date()
      })
    }
  }

  /**
   * Get metrics for a specific name
   */
  getMetrics(name: string, since?: Date): PerformanceMetric[] {
    let metrics = this.metrics.filter(m => m.name === name)
    
    if (since) {
      metrics = metrics.filter(m => m.timestamp >= since)
    }

    return metrics
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(name: string, since?: Date): {
    count: number
    avg: number
    min: number
    max: number
    sum: number
  } {
    const metrics = this.getMetrics(name, since)
    
    if (metrics.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, sum: 0 }
    }

    const values = metrics.map(m => m.value)
    const sum = values.reduce((a, b) => a + b, 0)
    
    return {
      count: metrics.length,
      avg: sum / metrics.length,
      min: Math.min(...values),
      max: Math.max(...values),
      sum
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number
    uniqueErrorTypes: number
    errorsByProvider: Record<string, number>
    recentErrors: ErrorMetric[]
  } {
    const totalErrors = Array.from(this.errors.values())
      .reduce((sum, error) => sum + error.count, 0)

    const errorsByProvider: Record<string, number> = {}
    for (const error of this.errors.values()) {
      const provider = error.providerId || 'unknown'
      errorsByProvider[provider] = (errorsByProvider[provider] || 0) + error.count
    }

    const recentErrors = Array.from(this.errors.values())
      .filter(error => Date.now() - error.lastOccurred.getTime() < 3600000) // Last hour
      .sort((a, b) => b.lastOccurred.getTime() - a.lastOccurred.getTime())
      .slice(0, 20)

    return {
      totalErrors,
      uniqueErrorTypes: this.errors.size,
      errorsByProvider,
      recentErrors
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    executionTimes: {
      avg: number
      p95: number
      p99: number
    }
    throughput: {
      actionsPerMinute: number
      workflowsPerMinute: number
    }
    providerStats: Array<{
      providerId: string
      totalActions: number
      avgResponseTime: number
      errorRate: number
    }>
  } {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 3600000)
    const oneMinuteAgo = new Date(now.getTime() - 60000)

    // Execution times
    const executionMetrics = this.getMetrics('execution_time', oneHourAgo)
    const executionTimes = executionMetrics.map(m => m.value).sort((a, b) => a - b)
    
    const p95Index = Math.floor(executionTimes.length * 0.95)
    const p99Index = Math.floor(executionTimes.length * 0.99)

    // Throughput
    const recentActions = this.getMetrics('action_executed', oneMinuteAgo)
    const recentWorkflows = this.getMetrics('workflow_completed', oneMinuteAgo)

    // Provider stats
    const providerStats: Record<string, any> = {}
    for (const metric of this.metrics) {
      if (metric.tags?.providerId && metric.timestamp >= oneHourAgo) {
        const providerId = metric.tags.providerId
        if (!providerStats[providerId]) {
          providerStats[providerId] = {
            providerId,
            totalActions: 0,
            totalResponseTime: 0,
            errors: 0
          }
        }

        if (metric.name === 'action_executed') {
          providerStats[providerId].totalActions++
        } else if (metric.name === 'response_time') {
          providerStats[providerId].totalResponseTime += metric.value
        }
      }
    }

    // Add error counts
    for (const error of this.errors.values()) {
      if (error.providerId && error.lastOccurred >= oneHourAgo) {
        if (providerStats[error.providerId]) {
          providerStats[error.providerId].errors += error.count
        }
      }
    }

    // Calculate averages and error rates
    const providerStatsArray = Object.values(providerStats).map((stats: any) => ({
      providerId: stats.providerId,
      totalActions: stats.totalActions,
      avgResponseTime: stats.totalActions > 0 
        ? stats.totalResponseTime / stats.totalActions 
        : 0,
      errorRate: stats.totalActions > 0 
        ? stats.errors / stats.totalActions 
        : 0
    }))

    return {
      executionTimes: {
        avg: executionTimes.length > 0 
          ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length 
          : 0,
        p95: executionTimes.length > 0 ? executionTimes[p95Index] || 0 : 0,
        p99: executionTimes.length > 0 ? executionTimes[p99Index] || 0 : 0
      },
      throughput: {
        actionsPerMinute: recentActions.length,
        workflowsPerMinute: recentWorkflows.length
      },
      providerStats: providerStatsArray
    }
  }

  /**
   * Clear old metrics and errors
   */
  cleanup(olderThan: Date = new Date(Date.now() - 86400000)): void {
    // Remove old metrics
    this.metrics = this.metrics.filter(m => m.timestamp >= olderThan)

    // Clean up old error examples
    for (const error of this.errors.values()) {
      error.examples = error.examples.filter(example => 
        example.timestamp >= olderThan
      )
    }

    // Remove errors with no recent examples
    for (const [key, error] of this.errors.entries()) {
      if (error.examples.length === 0 && error.lastOccurred < olderThan) {
        this.errors.delete(key)
      }
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): {
    metrics: PerformanceMetric[]
    errors: ErrorMetric[]
    summary: ReturnType<typeof this.getPerformanceSummary>
    timestamp: Date
  } {
    return {
      metrics: [...this.metrics],
      errors: Array.from(this.errors.values()),
      summary: this.getPerformanceSummary(),
      timestamp: new Date()
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor()