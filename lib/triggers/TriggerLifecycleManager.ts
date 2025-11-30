/**
 * TriggerLifecycleManager
 *
 * Central manager for ALL trigger lifecycle operations.
 * Ensures consistent resource management across all trigger types.
 */

import { createClient } from '@supabase/supabase-js'
import {
  TriggerLifecycle,
  TriggerProviderEntry,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from './types'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class TriggerLifecycleManager {
  private providers: Map<string, TriggerProviderEntry> = new Map()

  /**
   * Register a trigger provider with its lifecycle implementation
   */
  registerProvider(entry: TriggerProviderEntry): void {
    this.providers.set(entry.providerId, entry)
    logger.debug(`📝 Registered trigger provider: ${entry.providerId}`)
  }

  /**
   * Get lifecycle implementation for a provider
   */
  private getLifecycle(providerId: string): TriggerLifecycle | null {
    const entry = this.providers.get(providerId)
    if (!entry) {
      logger.warn(`⚠️ No lifecycle registered for provider: ${providerId}`)
      return null
    }
    return entry.lifecycle
  }

  /**
   * Activate ALL triggers in a workflow
   *
   * Called when workflow status changes to 'active'
   *
   * @param workflowId - The workflow ID
   * @param userId - The user ID
   * @param nodes - The workflow nodes
   * @param testMode - Optional test mode config for creating isolated test subscriptions
   */
  async activateWorkflowTriggers(
    workflowId: string,
    userId: string,
    nodes: any[],
    testMode?: { isTest: true; testSessionId: string }
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Filter to only trigger nodes
    const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)

    const modeLabel = testMode ? '🧪 TEST MODE' : '🚀 PRODUCTION'
    logger.debug(`${modeLabel} Activating ${triggerNodes.length} triggers for workflow ${workflowId}`)

    for (const node of triggerNodes) {
      const providerId = node.data?.providerId
      const triggerType = node.data?.type
      const config = node.data?.config || {}

      if (!providerId || !triggerType) {
        logger.warn(`⚠️ Skipping node ${node.id}: missing providerId or triggerType`)
        continue
      }

      const lifecycle = this.getLifecycle(providerId)
      if (!lifecycle) {
        // No lifecycle registered = no external resources needed (e.g., schedule, manual)
        logger.debug(`ℹ️ No lifecycle for ${providerId}, skipping (no external resources needed)`)
        continue
      }

      try {
        const context: TriggerActivationContext = {
          workflowId,
          userId,
          nodeId: node.id,
          triggerType,
          providerId,
          config,
          testMode
        }

        await lifecycle.onActivate(context)
        logger.debug(`✅ Activated trigger: ${providerId}/${triggerType} for workflow ${workflowId}${testMode ? ' (TEST)' : ''}`)

      } catch (error) {
        const errorMsg = `Failed to activate ${providerId}/${triggerType}: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    return {
      success: errors.length === 0,
      errors
    }
  }

  /**
   * Deactivate ALL triggers in a workflow
   *
   * Called when workflow status changes from 'active' to 'draft' or 'inactive'
   *
   * @param workflowId - The workflow ID
   * @param userId - The user ID
   * @param testSessionId - Optional: only deactivate test triggers for this session
   */
  async deactivateWorkflowTriggers(
    workflowId: string,
    userId: string,
    testSessionId?: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Build query based on whether we're deactivating test or production triggers
    let query = getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)

    if (testSessionId) {
      // Only deactivate test triggers for this specific session
      query = query.eq('test_session_id', testSessionId)
      logger.debug(`🧪 Deactivating TEST triggers for session ${testSessionId}`)
    } else {
      // Deactivate production triggers only (not test triggers)
      query = query.or('is_test.is.null,is_test.eq.false')
      logger.debug(`🛑 Deactivating PRODUCTION triggers for workflow ${workflowId}`)
    }

    const { data: resources } = await query

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No trigger resources found for workflow ${workflowId}${testSessionId ? ` (session ${testSessionId})` : ''}`)
      return { success: true, errors: [] }
    }

    logger.debug(`🛑 Deactivating ${resources.length} trigger resources for workflow ${workflowId}`)

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) {
        logger.warn(`⚠️ No lifecycle for ${resource.provider_id}, skipping cleanup`)
        continue
      }

      try {
        const context: TriggerDeactivationContext = {
          workflowId,
          userId,
          providerId: resource.provider_id,
          testSessionId
        }

        await lifecycle.onDeactivate(context)
        logger.debug(`✅ Deactivated trigger: ${resource.provider_id} for workflow ${workflowId}${testSessionId ? ' (TEST)' : ''}`)

      } catch (error) {
        const errorMsg = `Failed to deactivate ${resource.provider_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    return {
      success: errors.length === 0,
      errors
    }
  }

  /**
   * Delete ALL triggers in a workflow
   *
   * Called when workflow is deleted
   */
  async deleteWorkflowTriggers(
    workflowId: string,
    userId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Get all trigger resources for this workflow from database
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No trigger resources found for workflow ${workflowId}`)
      return { success: true, errors: [] }
    }

    logger.debug(`🗑️ Deleting ${resources.length} trigger resources for workflow ${workflowId}`)

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) {
        logger.warn(`⚠️ No lifecycle for ${resource.provider_id}, skipping cleanup`)
        continue
      }

      try {
        const context: TriggerDeactivationContext = {
          workflowId,
          userId,
          providerId: resource.provider_id
        }

        await lifecycle.onDelete(context)
        logger.debug(`✅ Deleted trigger: ${resource.provider_id} for workflow ${workflowId}`)

      } catch (error) {
        const errorMsg = `Failed to delete ${resource.provider_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    return {
      success: errors.length === 0,
      errors
    }
  }

  /**
   * Check health of all triggers in a workflow
   */
  async checkWorkflowTriggerHealth(
    workflowId: string,
    userId: string
  ): Promise<Map<string, TriggerHealthStatus>> {
    const healthStatuses = new Map<string, TriggerHealthStatus>()

    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('status', 'active')

    if (!resources) return healthStatuses

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) continue

      try {
        const status = await lifecycle.checkHealth(workflowId, userId)
        healthStatuses.set(resource.provider_id, status)
      } catch (error) {
        healthStatuses.set(resource.provider_id, {
          healthy: false,
          details: error instanceof Error ? error.message : 'Health check failed',
          lastChecked: new Date().toISOString()
        })
      }
    }

    return healthStatuses
  }

  /**
   * Get all registered providers
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Check if a provider requires external resources
   */
  requiresExternalResources(providerId: string): boolean {
    const entry = this.providers.get(providerId)
    return entry?.requiresExternalResources ?? false
  }
}

// Singleton instance
export const triggerLifecycleManager = new TriggerLifecycleManager()
