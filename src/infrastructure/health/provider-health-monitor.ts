import { providerRegistry } from '../../domains/integrations/use-cases/provider-registry'
import { ConnectorContract } from '../../domains/integrations/ports/connector-contract'

export interface ProviderHealthStatus {
  providerId: string
  providerName: string
  status: 'healthy' | 'unhealthy' | 'unknown' | 'checking'
  lastChecked: Date
  responseTime?: number
  error?: string
  capabilities: string[]
  metadata: {
    version: string
    registeredAt: Date
    totalChecks: number
    successfulChecks: number
    failureCount: number
    lastSuccessful?: Date
    lastFailure?: Date
  }
}

export interface SystemHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  totalProviders: number
  healthyProviders: number
  unhealthyProviders: number
  checkDuration: number
  providers: ProviderHealthStatus[]
  generatedAt: Date
}

/**
 * Monitors the health of all registered integration providers
 */
export class ProviderHealthMonitor {
  private healthCache = new Map<string, ProviderHealthStatus>()
  private checkIntervalMs: number
  private timeoutMs: number
  private intervalId?: NodeJS.Timeout

  constructor(checkIntervalMs = 300000, timeoutMs = 10000) { // 5 minutes, 10 second timeout
    this.checkIntervalMs = checkIntervalMs
    this.timeoutMs = timeoutMs
  }

  /**
   * Start automated health monitoring
   */
  startMonitoring(): void {
    console.log('🏥 Starting provider health monitoring...')
    
    // Initial health check
    this.performHealthCheck().catch(console.error)
    
    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck().catch(console.error)
    }, this.checkIntervalMs)
    
    console.log(`✅ Health monitoring started (check interval: ${this.checkIntervalMs / 1000}s)`)
  }

  /**
   * Stop automated health monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
      console.log('🛑 Provider health monitoring stopped')
    }
  }

  /**
   * Perform health check on all providers
   */
  async performHealthCheck(): Promise<SystemHealthReport> {
    const startTime = Date.now()
    console.log('🔍 Performing system health check...')
    
    const providers = providerRegistry.listProviders()
    const healthChecks = providers.map(async (provider) => {
      return this.checkProviderHealth(provider.providerId, provider.contract)
    })
    
    const results = await Promise.allSettled(healthChecks)
    const healthStatuses: ProviderHealthStatus[] = []
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const provider = providers[i]
      
      if (result.status === 'fulfilled') {
        healthStatuses.push(result.value)
      } else {
        // Create failed status for providers that couldn't be checked
        const failedStatus: ProviderHealthStatus = {
          providerId: provider.providerId,
          providerName: provider.name,
          status: 'unhealthy',
          lastChecked: new Date(),
          error: `Health check failed: ${result.reason?.message || 'Unknown error'}`,
          capabilities: provider.types,
          metadata: {
            version: provider.version,
            registeredAt: provider.registeredAt,
            totalChecks: this.healthCache.get(provider.providerId)?.metadata.totalChecks ?? 0,
            successfulChecks: this.healthCache.get(provider.providerId)?.metadata.successfulChecks ?? 0,
            failureCount: (this.healthCache.get(provider.providerId)?.metadata.failureCount ?? 0) + 1,
            lastFailure: new Date()
          }
        }
        healthStatuses.push(failedStatus)
        this.healthCache.set(provider.providerId, failedStatus)
      }
    }
    
    const healthyCount = healthStatuses.filter(h => h.status === 'healthy').length
    const unhealthyCount = healthStatuses.filter(h => h.status === 'unhealthy').length
    
    const overallStatus: SystemHealthReport['overall'] = 
      unhealthyCount === 0 ? 'healthy' :
      healthyCount > unhealthyCount ? 'degraded' : 'unhealthy'
    
    const report: SystemHealthReport = {
      overall: overallStatus,
      totalProviders: providers.length,
      healthyProviders: healthyCount,
      unhealthyProviders: unhealthyCount,
      checkDuration: Date.now() - startTime,
      providers: healthStatuses,
      generatedAt: new Date()
    }
    
    console.log(`✅ Health check completed: ${healthyCount}/${providers.length} providers healthy (${Date.now() - startTime}ms)`)
    
    return report
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(providerId: string, provider: ConnectorContract): Promise<ProviderHealthStatus> {
    const startTime = Date.now()
    const cached = this.healthCache.get(providerId)
    const providerInfo = providerRegistry.getRegistrationInfo(providerId)
    
    const baseStatus: Omit<ProviderHealthStatus, 'status' | 'error' | 'responseTime'> = {
      providerId,
      providerName: providerInfo?.name || providerId,
      lastChecked: new Date(),
      capabilities: providerRegistry.listProviders().find(p => p.providerId === providerId)?.types || [],
      metadata: {
        version: providerInfo?.version || '1.0.0',
        registeredAt: providerInfo?.registeredAt || new Date(),
        totalChecks: (cached?.metadata.totalChecks ?? 0) + 1,
        successfulChecks: cached?.metadata.successfulChecks ?? 0,
        failureCount: cached?.metadata.failureCount ?? 0,
        lastSuccessful: cached?.metadata.lastSuccessful,
        lastFailure: cached?.metadata.lastFailure
      }
    }

    try {
      // Use a test user ID for health checks (this should be configured)
      const testUserId = 'health-check-user'
      
      // Validate connection with timeout
      const isHealthy = await Promise.race([
        provider.validateConnection(testUserId),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), this.timeoutMs)
        )
      ])
      
      const responseTime = Date.now() - startTime
      
      const healthyStatus: ProviderHealthStatus = {
        ...baseStatus,
        status: isHealthy ? 'healthy' : 'unhealthy',
        responseTime,
        error: isHealthy ? undefined : 'Connection validation failed',
        metadata: {
          ...baseStatus.metadata,
          successfulChecks: isHealthy ? baseStatus.metadata.successfulChecks + 1 : baseStatus.metadata.successfulChecks,
          failureCount: isHealthy ? baseStatus.metadata.failureCount : baseStatus.metadata.failureCount + 1,
          lastSuccessful: isHealthy ? new Date() : baseStatus.metadata.lastSuccessful,
          lastFailure: isHealthy ? baseStatus.metadata.lastFailure : new Date()
        }
      }
      
      this.healthCache.set(providerId, healthyStatus)
      return healthyStatus
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      
      const unhealthyStatus: ProviderHealthStatus = {
        ...baseStatus,
        status: 'unhealthy',
        responseTime,
        error: error?.message || 'Unknown error during health check',
        metadata: {
          ...baseStatus.metadata,
          failureCount: baseStatus.metadata.failureCount + 1,
          lastFailure: new Date()
        }
      }
      
      this.healthCache.set(providerId, unhealthyStatus)
      return unhealthyStatus
    }
  }

  /**
   * Get cached health status for a specific provider
   */
  getProviderHealth(providerId: string): ProviderHealthStatus | undefined {
    return this.healthCache.get(providerId)
  }

  /**
   * Get health status for all providers (from cache)
   */
  getAllProviderHealth(): ProviderHealthStatus[] {
    return Array.from(this.healthCache.values())
  }

  /**
   * Get system health summary
   */
  getSystemHealthSummary(): {
    overall: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
    totalProviders: number
    healthyProviders: number
    unhealthyProviders: number
    lastChecked?: Date
  } {
    const allHealth = this.getAllProviderHealth()
    
    if (allHealth.length === 0) {
      return {
        overall: 'unknown',
        totalProviders: 0,
        healthyProviders: 0,
        unhealthyProviders: 0
      }
    }
    
    const healthyCount = allHealth.filter(h => h.status === 'healthy').length
    const unhealthyCount = allHealth.filter(h => h.status === 'unhealthy').length
    
    const overall = 
      unhealthyCount === 0 ? 'healthy' :
      healthyCount > unhealthyCount ? 'degraded' : 'unhealthy'
    
    const mostRecentCheck = allHealth.reduce((latest, current) => 
      current.lastChecked > latest ? current.lastChecked : latest, 
      new Date(0)
    )
    
    return {
      overall,
      totalProviders: allHealth.length,
      healthyProviders: healthyCount,
      unhealthyProviders: unhealthyCount,
      lastChecked: mostRecentCheck
    }
  }

  /**
   * Get providers that are currently unhealthy
   */
  getUnhealthyProviders(): ProviderHealthStatus[] {
    return this.getAllProviderHealth().filter(p => p.status === 'unhealthy')
  }

  /**
   * Get providers with the best/worst response times
   */
  getProviderPerformanceMetrics(): {
    fastest: ProviderHealthStatus[]
    slowest: ProviderHealthStatus[]
    averageResponseTime: number
  } {
    const allHealth = this.getAllProviderHealth()
      .filter(p => p.responseTime !== undefined)
    
    const sorted = [...allHealth].sort((a, b) => (a.responseTime || 0) - (b.responseTime || 0))
    
    const averageResponseTime = allHealth.reduce((sum, p) => sum + (p.responseTime || 0), 0) / allHealth.length
    
    return {
      fastest: sorted.slice(0, 5),
      slowest: sorted.slice(-5).reverse(),
      averageResponseTime
    }
  }

  /**
   * Clear health cache
   */
  clearCache(): void {
    this.healthCache.clear()
    console.log('🧹 Provider health cache cleared')
  }
}

// Singleton instance
export const healthMonitor = new ProviderHealthMonitor()