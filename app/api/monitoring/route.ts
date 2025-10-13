import { NextResponse } from "next/server"

import { logger } from '@/lib/utils/logger'

/**
 * Monitoring and metrics endpoint
 */
export async function GET() {
  try {
    // Import monitoring systems
    const { performanceMonitor } = await import("@/src/shared/monitoring/performance-monitor")
    const { eventBus } = await import("@/src/shared/events/event-bus")
    const { eventDrivenExecutor } = await import("@/src/domains/workflows/use-cases/event-driven-execution")
    const { providerRegistry } = await import("@/src/domains/integrations/use-cases/provider-registry")
    const { actionRegistry } = await import("@/src/domains/workflows/use-cases/action-registry")

    // Get performance summary
    const performanceSummary = performanceMonitor.getPerformanceSummary()
    
    // Get error statistics
    const errorStats = performanceMonitor.getErrorStats()
    
    // Get execution statistics
    const executionStats = eventDrivenExecutor.getExecutionStats()
    
    // Get architecture status
    const providers = providerRegistry.listProviders()
    const actions = actionRegistry.listActions()
    
    // Get recent metrics
    const recentExecutionTimes = performanceMonitor.getMetrics('execution_time', new Date(Date.now() - 3600000))
    const recentWorkflows = performanceMonitor.getMetrics('workflow_completed', new Date(Date.now() - 3600000))
    
    // Get event bus status
    const eventHistory = eventBus.getEventHistory(undefined, 20)
    const subscriptions = eventBus.getSubscriptions()

    // Calculate health score
    const totalActions = performanceSummary.providerStats.reduce((sum, p) => sum + p.totalActions, 0)
    const totalErrors = errorStats.totalErrors
    const healthScore = totalActions > 0 ? Math.max(0, 100 - (totalErrors / totalActions * 100)) : 100

    return jsonResponse({
      success: true,
      monitoring: {
        healthScore: Math.round(healthScore),
        timestamp: new Date().toISOString(),
        
        // Architecture status
        architecture: {
          providers: {
            count: providers.length,
            list: providers.map(p => ({
              id: p.providerId,
              name: p.name,
              types: p.types
            }))
          },
          actions: {
            count: actions.length,
            byCategory: actions.reduce((acc: any, action) => {
              const category = action.metadata.category
              acc[category] = (acc[category] || 0) + 1
              return acc
            }, {})
          }
        },

        // Performance metrics
        performance: {
          summary: performanceSummary,
          recentExecutionTimes: {
            count: recentExecutionTimes.length,
            average: recentExecutionTimes.length > 0 
              ? recentExecutionTimes.reduce((sum, m) => sum + m.value, 0) / recentExecutionTimes.length
              : 0,
            samples: recentExecutionTimes.slice(0, 10).map(m => ({
              value: m.value,
              timestamp: m.timestamp,
              tags: m.tags
            }))
          },
          workflowMetrics: {
            completedLastHour: recentWorkflows.length,
            executionStats
          }
        },

        // Error tracking
        errors: {
          stats: errorStats,
          recentByType: errorStats.recentErrors.reduce((acc: any, error) => {
            acc[error.errorType] = (acc[error.errorType] || 0) + error.count
            return acc
          }, {}),
          criticalErrors: errorStats.recentErrors
            .filter(error => error.count > 5)
            .map(error => ({
              type: error.errorType,
              count: error.count,
              provider: error.providerId,
              lastOccurred: error.lastOccurred,
              latestExample: error.examples[error.examples.length - 1]?.message
            }))
        },

        // Event system status
        events: {
          subscriptions: {
            count: eventBus.getSubscriptionCount(),
            byType: subscriptions
          },
          recentEvents: eventHistory.map(event => ({
            id: event.id,
            type: event.type,
            aggregateId: event.aggregateId,
            occurredOn: event.occurredOn,
            dataKeys: Object.keys(event.data)
          })),
          eventCounts: eventHistory.reduce((acc: any, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1
            return acc
          }, {})
        },

        // System health indicators
        health: {
          score: healthScore,
          indicators: {
            architectureLoaded: providers.length > 0 && actions.length > 0,
            eventsActive: eventBus.getSubscriptionCount() > 0,
            metricsCollecting: recentExecutionTimes.length > 0 || recentWorkflows.length > 0,
            errorRateAcceptable: (totalErrors / Math.max(totalActions, 1)) < 0.1,
            averageResponseTime: performanceSummary.executionTimes.avg < 5000 // 5 seconds
          }
        }
      }
    })

  } catch (error: any) {
    logger.error("❌ Monitoring endpoint failed:", error)
    
    return jsonResponse({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}

/**
 * Reset metrics for testing
 */
export async function DELETE() {
  try {
    const { performanceMonitor } = await import("@/src/shared/monitoring/performance-monitor")
    const { eventBus } = await import("@/src/shared/events/event-bus")

    // Clean up old data
    performanceMonitor.cleanup()
    eventBus.clear()

    return jsonResponse({
      success: true,
      message: "Monitoring data cleared"
    })

  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}