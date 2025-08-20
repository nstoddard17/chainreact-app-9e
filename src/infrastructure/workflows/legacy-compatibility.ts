/**
 * LEGACY COMPATIBILITY LAYER
 * 
 * This file provides backward compatibility for the legacy workflow execution APIs
 * while routing them through the new advanced workflow infrastructure.
 * 
 * TODO: Remove this file once all API routes have been migrated to use the new
 * workflow engine directly.
 */

import { workflowEngine, TriggerType, ExecutionPriority } from './workflow-engine'
import { oauthTokenManager } from '../security/oauth-token-manager'
import { auditLogger, AuditEventType } from '../security/audit-logger'

/**
 * Legacy action result interface
 */
export interface LegacyActionResult {
  success: boolean
  data?: any
  error?: string
  logs?: string[]
}

/**
 * Legacy execute action parameters
 */
export interface LegacyExecuteActionParams {
  node: {
    data: {
      type: string
      config: Record<string, any>
    }
    [key: string]: any
  }
  input: Record<string, any>
  userId: string
  workflowId?: string
}

/**
 * DEPRECATED: Legacy executeAction compatibility function
 * 
 * This function provides backward compatibility for the old executeAction API.
 * New code should use the workflowEngine.executeWorkflow() method directly.
 * 
 * @deprecated Use workflowEngine.executeWorkflow() instead
 */
export async function executeAction(params: LegacyExecuteActionParams): Promise<LegacyActionResult> {
  console.warn('⚠️  Using deprecated executeAction compatibility layer. Migrate to workflowEngine.executeWorkflow()')
  
  const { node, input, userId, workflowId } = params
  
  try {
    // Log the deprecated usage
    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_WARNING,
      severity: 'warning',
      action: 'legacy_execute_action_used',
      outcome: 'success',
      description: `Legacy executeAction called for node type: ${node.data.type}`,
      userId,
      resource: workflowId || 'unknown',
      metadata: {
        nodeType: node.data.type,
        migrationRequired: true
      }
    })

    // For now, import and delegate to the legacy implementation
    // This maintains compatibility while we migrate APIs
    const { executeAction: legacyExecuteAction } = await import('@/lib/workflows/executeNode')
    
    return await legacyExecuteAction(params)
    
  } catch (error: any) {
    console.error('❌ Legacy executeAction compatibility layer error:', error)
    
    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_ERROR,
      severity: 'error',
      action: 'legacy_execute_action_failed',
      outcome: 'failure',
      description: `Legacy executeAction failed for node type: ${node.data.type}`,
      userId,
      resource: workflowId || 'unknown',
      metadata: {
        nodeType: node.data.type,
        error: error.message
      }
    })
    
    return {
      success: false,
      error: error.message,
      logs: [error.message]
    }
  }
}

/**
 * DEPRECATED: Legacy token refresh service compatibility
 * 
 * Routes through the new OAuth token manager.
 * 
 * @deprecated Use oauthTokenManager directly
 */
export class LegacyTokenRefreshService {
  static async shouldRefreshToken(integration: any, options: any = {}): Promise<boolean> {
    console.warn('⚠️  Using deprecated TokenRefreshService. Migrate to oauthTokenManager')
    
    try {
      // Delegate to new token manager
      return await oauthTokenManager.shouldRefreshToken(integration.provider, {
        accessToken: integration.access_token,
        refreshToken: integration.refresh_token,
        expiresAt: integration.expires_at ? new Date(integration.expires_at) : undefined,
        ...options
      })
    } catch (error) {
      console.error('❌ Legacy token refresh compatibility error:', error)
      return false
    }
  }
  
  static async refreshTokens(integration: any, options: any = {}): Promise<any> {
    console.warn('⚠️  Using deprecated TokenRefreshService. Migrate to oauthTokenManager')
    
    try {
      // Delegate to new token manager
      const result = await oauthTokenManager.refreshToken(integration.provider, {
        refreshToken: integration.refresh_token,
        integrationId: integration.id,
        userId: integration.user_id,
        ...options
      })
      
      return {
        success: true,
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        expires_at: result.expiresAt?.toISOString(),
        updated_scopes: result.scopes
      }
    } catch (error: any) {
      console.error('❌ Legacy token refresh compatibility error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
  
  static async refreshTokenForProvider(provider: string, refreshToken: string, integration: any): Promise<any> {
    console.warn('⚠️  Using deprecated TokenRefreshService.refreshTokenForProvider. Migrate to oauthTokenManager')
    
    try {
      // For now, delegate to the legacy implementation to maintain compatibility
      const { TokenRefreshService } = await import('@/lib/integrations/tokenRefreshService')
      return await TokenRefreshService.refreshTokenForProvider(provider, refreshToken, integration)
    } catch (error: any) {
      console.error('❌ Legacy token refresh for provider compatibility error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
  
  static async getTokensNeedingRefresh(): Promise<any> {
    console.warn('⚠️  Using deprecated TokenRefreshService.getTokensNeedingRefresh. Migrate to oauthTokenManager')
    
    try {
      // For now, delegate to the legacy implementation to maintain compatibility
      const { getTokensNeedingRefresh } = await import('@/lib/integrations/tokenRefreshService')
      return await getTokensNeedingRefresh()
    } catch (error: any) {
      console.error('❌ Legacy get tokens needing refresh compatibility error:', error)
      return []
    }
  }
}

/**
 * Migration utility to help track legacy API usage
 */
export class LegacyMigrationTracker {
  private static usageMap = new Map<string, number>()
  
  static trackUsage(apiName: string, location: string): void {
    const key = `${apiName}:${location}`
    const currentCount = this.usageMap.get(key) || 0
    this.usageMap.set(key, currentCount + 1)
    
    // Log every 10th usage to avoid spam
    if (currentCount % 10 === 0) {
      console.warn(`🔄 Legacy API '${apiName}' used ${currentCount + 1} times from ${location}. Migration required.`)
    }
  }
  
  static getUsageReport(): Record<string, number> {
    return Object.fromEntries(this.usageMap.entries())
  }
  
  static clearUsageStats(): void {
    this.usageMap.clear()
  }
}

/**
 * Helper to create workflow definitions for single node execution
 * This enables using the new workflow engine for legacy single-action calls
 */
export function createSingleNodeWorkflow(node: any, workflowId: string): any {
  return {
    id: workflowId || `single_node_${Date.now()}`,
    name: `Single Node Execution: ${node.data.type}`,
    description: 'Auto-generated workflow for legacy single node execution',
    version: 1,
    userId: 'legacy_compatibility',
    status: 'active',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: 'Manual Trigger',
          config: {},
          isTrigger: true
        }
      },
      {
        id: 'action',
        type: node.data.type,
        position: { x: 200, y: 0 },
        data: {
          label: node.data.label || node.data.type,
          config: node.data.config
        }
      }
    ],
    edges: [
      {
        id: 'trigger_to_action',
        source: 'trigger',
        target: 'action',
        type: 'default'
      }
    ],
    variables: [],
    settings: {
      concurrentExecutions: 1,
      executionTimeout: 30000,
      retryPolicy: {
        enabled: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 10000,
        retryableErrors: [],
        skipRetryConditions: []
      },
      errorHandling: {
        strategy: 'fail_fast',
        fallbackActions: [],
        errorNotifications: false,
        captureStackTrace: true,
        sensitiveDataMasking: true
      },
      logging: {
        level: 'info',
        includeInput: true,
        includeOutput: true,
        includeTimings: true,
        includeHeaders: false,
        retention: 7,
        redactFields: ['password', 'token', 'secret']
      },
      notifications: {
        onSuccess: false,
        onFailure: false,
        onTimeout: false,
        channels: []
      },
      performance: {
        enableMetrics: true,
        enableTracing: false,
        samplingRate: 0.1,
        metricsRetention: 30,
        alertThresholds: {
          executionTime: 30000,
          errorRate: 0.1,
          memoryUsage: 512
        }
      }
    },
    triggers: [
      {
        id: 'manual_trigger',
        type: 'manual',
        enabled: true,
        config: {},
        conditions: []
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['legacy_compatibility'],
    category: 'system'
  }
}