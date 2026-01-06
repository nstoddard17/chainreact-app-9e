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
   * Extract the base provider name from a full providerId
   *
   * Provider IDs can be:
   * - Base name: "microsoft-outlook", "gmail", "slack"
   * - Full trigger type: "microsoft-outlook_trigger_new_email", "gmail_trigger_new_email"
   *
   * This method extracts the base provider name by:
   * 1. Trying exact match first
   * 2. Finding the longest registered provider that is a prefix of the providerId
   */
  private extractBaseProvider(providerId: string): string | null {
    // First, check for exact match
    if (this.providers.has(providerId)) {
      return providerId
    }

    // Find the longest matching registered provider prefix
    // Sort by length descending to find longest match first (e.g., "google-calendar" before "google")
    const registeredProviders = Array.from(this.providers.keys()).sort((a, b) => b.length - a.length)

    for (const registered of registeredProviders) {
      // Check if providerId starts with the registered provider followed by underscore
      // e.g., "microsoft-outlook_trigger_new_email" starts with "microsoft-outlook_"
      if (providerId.startsWith(registered + '_')) {
        return registered
      }
    }

    return null
  }

  /**
   * Get lifecycle implementation for a provider
   */
  private getLifecycle(providerId: string): TriggerLifecycle | null {
    const baseProvider = this.extractBaseProvider(providerId)
    if (!baseProvider) {
      logger.warn(`⚠️ No lifecycle registered for provider: ${providerId}`)
      return null
    }

    const entry = this.providers.get(baseProvider)
    if (!entry) {
      logger.warn(`⚠️ No lifecycle registered for provider: ${providerId} (base: ${baseProvider})`)
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
   * Delete triggers for a specific node that was removed from the workflow
   *
   * Called when a trigger node is deleted from the workflow builder
   */
  async deleteNodeTrigger(
    workflowId: string,
    userId: string,
    nodeId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Get all trigger resources for this specific node
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No trigger resources found for node ${nodeId} in workflow ${workflowId}`)
      return { success: true, errors: [] }
    }

    logger.debug(`🗑️ Deleting ${resources.length} trigger resources for node ${nodeId}`)

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) {
        // No lifecycle = just delete the database record
        logger.debug(`ℹ️ No lifecycle for ${resource.provider_id}, deleting DB record only`)
        await getSupabase()
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)
        continue
      }

      try {
        const context: TriggerDeactivationContext = {
          workflowId,
          userId,
          providerId: resource.provider_id,
          nodeId  // Pass nodeId for per-node cleanup
        }

        await lifecycle.onDelete(context)
        logger.debug(`✅ Deleted trigger for node ${nodeId}: ${resource.provider_id}`)

      } catch (error) {
        const errorMsg = `Failed to delete trigger for node ${nodeId}: ${error instanceof Error ? error.message : 'Unknown error'}`
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
   * Clean up orphaned trigger resources for nodes that no longer exist in workflow
   *
   * Called during apply-edits to detect and clean up removed trigger nodes
   */
  async cleanupRemovedTriggerNodes(
    workflowId: string,
    userId: string,
    currentNodeIds: string[]
  ): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
    const errors: string[] = []
    let deletedCount = 0

    // Get all trigger resources for this workflow
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)

    if (!resources || resources.length === 0) {
      return { success: true, deletedCount: 0, errors: [] }
    }

    // Find resources for nodes that no longer exist
    const orphanedResources = resources.filter(r => !currentNodeIds.includes(r.node_id))

    if (orphanedResources.length === 0) {
      return { success: true, deletedCount: 0, errors: [] }
    }

    logger.debug(`🧹 Found ${orphanedResources.length} orphaned trigger resources to clean up`)

    for (const resource of orphanedResources) {
      try {
        const result = await this.deleteNodeTrigger(workflowId, userId, resource.node_id)
        if (result.success) {
          deletedCount++
        } else {
          errors.push(...result.errors)
        }
      } catch (error) {
        const errorMsg = `Failed to cleanup node ${resource.node_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    logger.debug(`🧹 Cleaned up ${deletedCount} orphaned trigger resources`)

    return {
      success: errors.length === 0,
      deletedCount,
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
