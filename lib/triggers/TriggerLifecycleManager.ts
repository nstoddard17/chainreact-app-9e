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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class TriggerLifecycleManager {
  private providers: Map<string, TriggerProviderEntry> = new Map()

  /**
   * Register a trigger provider with its lifecycle implementation
   */
  registerProvider(entry: TriggerProviderEntry): void {
    this.providers.set(entry.providerId, entry)
    console.log(`📝 Registered trigger provider: ${entry.providerId}`)
  }

  /**
   * Get lifecycle implementation for a provider
   */
  private getLifecycle(providerId: string): TriggerLifecycle | null {
    const entry = this.providers.get(providerId)
    if (!entry) {
      console.warn(`⚠️ No lifecycle registered for provider: ${providerId}`)
      return null
    }
    return entry.lifecycle
  }

  /**
   * Activate ALL triggers in a workflow
   *
   * Called when workflow status changes to 'active'
   */
  async activateWorkflowTriggers(
    workflowId: string,
    userId: string,
    nodes: any[]
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Filter to only trigger nodes
    const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)

    console.log(`🚀 Activating ${triggerNodes.length} triggers for workflow ${workflowId}`)

    for (const node of triggerNodes) {
      const providerId = node.data?.providerId
      const triggerType = node.data?.type
      const config = node.data?.config || {}

      if (!providerId || !triggerType) {
        console.warn(`⚠️ Skipping node ${node.id}: missing providerId or triggerType`)
        continue
      }

      const lifecycle = this.getLifecycle(providerId)
      if (!lifecycle) {
        // No lifecycle registered = no external resources needed (e.g., schedule, manual)
        console.log(`ℹ️ No lifecycle for ${providerId}, skipping (no external resources needed)`)
        continue
      }

      try {
        const context: TriggerActivationContext = {
          workflowId,
          userId,
          nodeId: node.id,
          triggerType,
          providerId,
          config
        }

        await lifecycle.onActivate(context)
        console.log(`✅ Activated trigger: ${providerId}/${triggerType} for workflow ${workflowId}`)

      } catch (error) {
        const errorMsg = `Failed to activate ${providerId}/${triggerType}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ ${errorMsg}`)
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
   * Called when workflow status changes from 'active' to 'draft' or 'paused'
   */
  async deactivateWorkflowTriggers(
    workflowId: string,
    userId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    // Get all trigger resources for this workflow from database
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No trigger resources found for workflow ${workflowId}`)
      return { success: true, errors: [] }
    }

    console.log(`🛑 Deactivating ${resources.length} trigger resources for workflow ${workflowId}`)

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) {
        console.warn(`⚠️ No lifecycle for ${resource.provider_id}, skipping cleanup`)
        continue
      }

      try {
        const context: TriggerDeactivationContext = {
          workflowId,
          userId,
          providerId: resource.provider_id
        }

        await lifecycle.onDeactivate(context)
        console.log(`✅ Deactivated trigger: ${resource.provider_id} for workflow ${workflowId}`)

      } catch (error) {
        const errorMsg = `Failed to deactivate ${resource.provider_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ ${errorMsg}`)
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
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No trigger resources found for workflow ${workflowId}`)
      return { success: true, errors: [] }
    }

    console.log(`🗑️ Deleting ${resources.length} trigger resources for workflow ${workflowId}`)

    for (const resource of resources) {
      const lifecycle = this.getLifecycle(resource.provider_id)
      if (!lifecycle) {
        console.warn(`⚠️ No lifecycle for ${resource.provider_id}, skipping cleanup`)
        continue
      }

      try {
        const context: TriggerDeactivationContext = {
          workflowId,
          userId,
          providerId: resource.provider_id
        }

        await lifecycle.onDelete(context)
        console.log(`✅ Deleted trigger: ${resource.provider_id} for workflow ${workflowId}`)

      } catch (error) {
        const errorMsg = `Failed to delete ${resource.provider_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`❌ ${errorMsg}`)
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

    const { data: resources } = await supabase
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
