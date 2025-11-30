/**
 * Webhook Trigger Lifecycle
 *
 * Manages webhook trigger lifecycle for custom HTTP webhooks.
 * Unlike other triggers that create external resources (subscriptions, webhooks),
 * webhook triggers are passive receivers - they generate a unique URL and wait
 * for external systems to call them.
 *
 * Lifecycle:
 * - onActivate: Generate unique webhook URL and store configuration
 * - onDeactivate: Mark webhook as inactive (URL becomes non-functional)
 * - onDelete: Remove webhook configuration completely
 * - checkHealth: Verify webhook configuration exists and is valid
 */

import { createClient } from '@supabase/supabase-js'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'
import crypto from 'crypto'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class WebhookTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate webhook trigger
   * Generates unique webhook URL and stores configuration
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating webhook trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Generate unique webhook ID (used in URL)
    const webhookId = crypto.randomBytes(16).toString('hex')

    // Generate optional HMAC secret for signature verification
    const hmacSecret = crypto.randomBytes(32).toString('hex')

    // Construct webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const webhookUrl = `${baseUrl}/api/workflow-webhooks/${workflowId}`

    // Store webhook configuration in trigger_resources
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'webhook',
      provider_id: 'webhook',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhookId,
      external_id: webhookId, // Store webhook ID for reference
      config: {
        ...config,
        webhookId,
        webhookUrl,
        hmacSecret, // Store for signature verification
        path: config.path || '/',
        method: config.method || 'POST',
        createdAt: new Date().toISOString()
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Webhook trigger activated (without local record)`, { webhookUrl, webhookId })
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    // Also create entry in webhook_configs for tracking and management
    await getSupabase().from('webhook_configs').insert({
      user_id: userId,
      workflow_id: workflowId,
      name: `Webhook for ${workflowId}`,
      description: `Auto-generated webhook trigger`,
      webhook_url: webhookUrl,
      method: config.method || 'POST',
      headers: {},
      trigger_type: triggerType,
      provider_id: 'webhook',
      status: 'active'
    })

    logger.debug(`✅ Webhook trigger activated`, {
      webhookUrl,
      webhookId
    })
  }

  /**
   * Deactivate webhook trigger
   * Marks webhook as inactive (URL will return 404)
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`🛑 Deactivating webhook triggers for workflow ${workflowId}`)

    // Mark trigger_resources as deleted
    await getSupabase()
      .from('trigger_resources')
      .update({ status: 'deleted' })
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')
      .eq('status', 'active')

    // Mark webhook_configs as inactive
    await getSupabase()
      .from('webhook_configs')
      .update({ status: 'inactive' })
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')
      .eq('status', 'active')

    logger.debug(`✅ Webhook triggers deactivated`)
  }

  /**
   * Delete webhook trigger
   * Completely removes webhook configuration
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`🗑️ Deleting webhook triggers for workflow ${workflowId}`)

    // Delete from trigger_resources
    await getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')

    // Delete from webhook_configs
    await getSupabase()
      .from('webhook_configs')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')

    logger.debug(`✅ Webhook triggers deleted`)
  }

  /**
   * Check health of webhook triggers
   * Verifies configuration exists and is valid
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhook triggers found',
        lastChecked: new Date().toISOString()
      }
    }

    // Verify webhook_configs entry exists
    const { data: webhookConfig } = await getSupabase()
      .from('webhook_configs')
      .select('id, status, error_count, last_triggered')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'webhook')
      .eq('status', 'active')
      .single()

    if (!webhookConfig) {
      return {
        healthy: false,
        details: 'Webhook configuration missing',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if webhook has high error rate
    if (webhookConfig.error_count && webhookConfig.error_count > 10) {
      return {
        healthy: false,
        details: `Webhook has ${webhookConfig.error_count} consecutive errors`,
        lastChecked: new Date().toISOString()
      }
    }

    return {
      healthy: true,
      details: `Webhook healthy${webhookConfig.last_triggered ? `, last triggered: ${webhookConfig.last_triggered}` : ''}`,
      lastChecked: new Date().toISOString()
    }
  }
}
