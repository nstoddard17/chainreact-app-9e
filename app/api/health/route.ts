import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { healthMonitor } from "../../../src/infrastructure/health/provider-health-monitor"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const url = new URL(request.url)
    const detailed = url.searchParams.get('detailed') === 'true'
    const providerId = url.searchParams.get('provider')
    const includeProviders = url.searchParams.get('providers') !== 'false'
    
    // Check database connectivity
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count', { count: 'exact', head: true })
    
    const dbHealthy = !error
    const dbResponseTime = Date.now() - startTime
    
    // If requesting specific provider health
    if (providerId) {
      const providerHealth = healthMonitor.getProviderHealth(providerId)
      
      if (!providerHealth) {
        return NextResponse.json(
          { error: `Provider '${providerId}' not found` },
          { status: 404 }
        )
      }
      
      return NextResponse.json(providerHealth)
    }
    
    const baseResponse = {
      status: dbHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
      services: {
        database: {
          status: dbHealthy ? "healthy" : "unhealthy",
          responseTime: `${dbResponseTime}ms`,
          ...(error && { error: error.message })
        }
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0"
    }
    
    // Add provider health information if requested
    if (includeProviders) {
      try {
        if (detailed) {
          // Perform fresh health check on all providers
          const providerReport = await healthMonitor.performHealthCheck()
          
          return NextResponse.json({
            ...baseResponse,
            status: dbHealthy && providerReport.overall !== 'unhealthy' ? 
              (providerReport.overall === 'healthy' ? 'healthy' : 'degraded') : 'unhealthy',
            providers: {
              overall: providerReport.overall,
              total: providerReport.totalProviders,
              healthy: providerReport.healthyProviders,
              unhealthy: providerReport.unhealthyProviders,
              checkDuration: providerReport.checkDuration,
              providers: providerReport.providers
            }
          })
        } 
          // Return cached provider health summary
          const providerSummary = healthMonitor.getSystemHealthSummary()
          
          return NextResponse.json({
            ...baseResponse,
            status: dbHealthy && providerSummary.overall !== 'unhealthy' ? 
              (providerSummary.overall === 'healthy' ? 'healthy' : 'degraded') : 'unhealthy',
            providers: {
              overall: providerSummary.overall,
              total: providerSummary.totalProviders,
              healthy: providerSummary.healthyProviders,
              unhealthy: providerSummary.unhealthyProviders,
              lastChecked: providerSummary.lastChecked
            }
          })
        
      } catch (providerError) {
        // If provider health check fails, still return basic health
        logger.error('Provider health check failed:', providerError)
        
        return NextResponse.json({
          ...baseResponse,
          providers: {
            status: 'unknown',
            error: 'Provider health check failed'
          }
        })
      }
    }
    
    return NextResponse.json(baseResponse)
    
  } catch (error) {
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
      services: {
        database: {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error"
        }
      }
    }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { action, providerId } = body
    
    switch (action) {
      case 'check': {
        if (providerId) {
          // Check specific provider
          const provider = healthMonitor.getProviderHealth(providerId)
          if (!provider) {
            return NextResponse.json(
              { error: `Provider '${providerId}' not found` },
              { status: 404 }
            )
          }

          // Force a fresh health check for this provider
          const report = await healthMonitor.performHealthCheck()
          const updatedProvider = report.providers.find(p => p.providerId === providerId)

          return NextResponse.json(updatedProvider)
        }
        // Check all providers
        const report = await healthMonitor.performHealthCheck()
        return NextResponse.json(report)
      }
        
        
      case 'start_monitoring':
        healthMonitor.startMonitoring()
        return NextResponse.json({ 
          message: 'Health monitoring started',
          status: 'monitoring'
        })
        
      case 'stop_monitoring':
        healthMonitor.stopMonitoring()
        return NextResponse.json({ 
          message: 'Health monitoring stopped',
          status: 'stopped'
        })
        
      case 'clear_cache':
        healthMonitor.clearCache()
        return NextResponse.json({ 
          message: 'Health cache cleared',
          status: 'cleared'
        })
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: check, start_monitoring, stop_monitoring, clear_cache' },
          { status: 400 }
        )
    }
    
  } catch (error: any) {
    logger.error('Health check API POST error:', error)
    
    return NextResponse.json(
      { 
        error: 'Health check operation failed',
        message: error.message 
      },
      { status: 500 }
    )
  }
} 