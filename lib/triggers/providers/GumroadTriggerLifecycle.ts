/**
 * Gumroad Trigger Lifecycle
 *
 * Manages Gumroad webhook triggers
 *
 * NOTE: Gumroad doesn't provide programmatic webhook management via API.
 * Webhooks must be configured manually in the Gumroad dashboard:
 * https://app.gumroad.com/settings/advanced#ping-settings
 *
 * This lifecycle handler tracks trigger resources for:
 * - Routing incoming webhooks to the correct workflow
 * - Health monitoring
 * - Cleanup on workflow deletion
 */

import { createClient } from '@supabase/supabase-js'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class GumroadTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Gumroad trigger
   *
   * Since Gumroad doesn't support programmatic webhook creation,
   * we just register the trigger configuration for routing purposes.
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Gumroad trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Check if user has Gumroad integration
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'gumroad')
      .single()

    if (!integration) {
      throw new Error('Gumroad integration not found for user')
    }

    // Get webhook callback URL for instructions
    const webhookUrl = this.getWebhookUrl()

    // Store in trigger_resources table for routing and tracking
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'gumroad',
      provider_id: 'gumroad',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: `${workflowId}-${nodeId}`, // Generated ID for manual webhooks
      config: {
        ...config,
        webhookUrl: `${webhookUrl}?workflowId=${workflowId}`,
        eventType: this.getEventTypeForTrigger(triggerType),
        manualSetup: true,
        setupInstructions: `Configure this webhook URL in Gumroad dashboard: ${webhookUrl}?workflowId=${workflowId}`
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Gumroad trigger registered (without local record) for workflow ${workflowId}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Gumroad trigger registered for workflow ${workflowId}`)
    logger.info(`📝 Gumroad webhook must be manually configured at: https://app.gumroad.com/settings/advanced#ping-settings`)
    logger.info(`📝 Use this webhook URL: ${webhookUrl}?workflowId=${workflowId}`)
  }

  /**
   * Deactivate Gumroad trigger
   * Removes the trigger registration from database
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`🛑 Deactivating Gumroad triggers for workflow ${workflowId}`)

    // Get all Gumroad triggers for this workflow
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'gumroad')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Gumroad triggers for workflow ${workflowId}`)
      return
    }

    // Delete trigger registrations
    await getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'gumroad')

    logger.debug(`✅ Gumroad trigger registrations removed for workflow ${workflowId}`)
    logger.info(`📝 Remember to remove webhook from Gumroad dashboard if no longer needed`)
  }

  /**
   * Delete Gumroad trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Gumroad webhook triggers
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'gumroad')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active trigger registrations found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if user still has Gumroad integration
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'gumroad')
      .single()

    if (!integration) {
      return {
        healthy: false,
        details: 'Gumroad integration disconnected',
        lastChecked: new Date().toISOString()
      }
    }

    // Gumroad webhooks don't expire, so healthy if registered
    return {
      healthy: true,
      details: `Gumroad trigger registrations healthy (${resources.length} active). Ensure webhooks are configured in Gumroad dashboard.`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Gumroad event type
   */
  private getEventTypeForTrigger(triggerType: string): string {
    const eventMap: Record<string, string> = {
      'gumroad_trigger_new_sale': 'sale',
      'gumroad_trigger_new_subscriber': 'subscription_created',
      'gumroad_trigger_subscription_cancelled': 'cancellation',
      'gumroad_trigger_sale_refunded': 'refund',
      'gumroad_trigger_new_product': 'product_created',
      'gumroad_trigger_dispute': 'dispute',
      'gumroad_trigger_dispute_won': 'dispute_won',
      'gumroad_trigger_subscription_updated': 'subscription_updated',
      'gumroad_trigger_subscription_ended': 'subscription_ended',
      'gumroad_trigger_subscription_restarted': 'subscription_restarted'
    }

    const event = eventMap[triggerType]
    if (!event) {
      throw new Error(`Unknown Gumroad trigger type: ${triggerType}`)
    }

    return event
  }

  /**
   * Get webhook callback URL
   */
  private getWebhookUrl(): string {
    const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
                    process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ||
                    process.env.PUBLIC_WEBHOOK_BASE_URL

    if (!baseUrl) {
      throw new Error('Webhook base URL not configured')
    }

    return `${baseUrl.replace(/\/$/, '')}/api/webhooks/gumroad`
  }
}
