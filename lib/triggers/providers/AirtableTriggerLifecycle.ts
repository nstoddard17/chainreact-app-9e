/**
 * Airtable Trigger Lifecycle
 *
 * Manages webhooks for Airtable triggers
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'
import { getWebhookUrl } from '@/lib/webhooks/utils'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class AirtableTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Airtable trigger
   * Creates a webhook for the specified base/table
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Airtable trigger for workflow ${workflowId}`, {
      triggerType,
      baseId: config.baseId,
      tableName: config.tableName
    })

    // Get user's Airtable integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'airtable')
      .single()

    if (!integration) {
      throw new Error('Airtable integration not found for user')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Airtable access token')
    }

    const { baseId, tableName } = config

    if (!baseId) {
      throw new Error('Base ID is required for Airtable trigger')
    }

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    logger.debug(`📤 Creating Airtable webhook`, {
      baseId,
      tableName: tableName || 'all tables',
      webhookUrl
    })

    // Create webhook specification
    const spec: any = {}

    // Filter by table if specified
    if (tableName) {
      spec.options = {
        filters: {
          dataTypes: ['tableData'],
          recordChangeScope: tableName
        }
      }
    }

    // Create webhook in Airtable
    const response = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        notificationUrl: `${webhookUrl}?workflowId=${workflowId}`,
        specification: spec
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create Airtable webhook: ${response.status} ${errorText}`)
    }

    const webhook = await response.json()

    // Store in trigger_resources table
    const { error: insertError } = await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'airtable',
      provider_id: 'airtable',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhook.id,
      external_id: webhook.id,
      config: {
        baseId,
        tableName,
        webhookUrl: webhook.notificationUrl,
        macSecretBase64: webhook.macSecretBase64
      },
      status: 'active',
      expires_at: webhook.expirationTime ? new Date(webhook.expirationTime).toISOString() : null
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      // The webhook was already created successfully with Airtable, so we can continue
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Airtable webhook created (without local record): ${webhook.id}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Airtable webhook created: ${webhook.id}`)
  }

  /**
   * Deactivate Airtable trigger
   * Deletes the webhook
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating Airtable triggers for workflow ${workflowId}`)

    // Get all Airtable webhooks for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'airtable')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Airtable webhooks for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'airtable')
      .single()

    if (!integration) {
      logger.warn(`⚠️ Airtable integration not found, marking webhooks as deleted`)
      // Mark as deleted even if we can't clean up in Airtable
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'airtable')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      logger.warn(`⚠️ Failed to decrypt Airtable access token, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'airtable')
      return
    }

    // Delete each webhook
    for (const resource of resources) {
      if (!resource.external_id || !resource.config?.baseId) continue

      try {
        const baseId = resource.config.baseId
        const webhookId = resource.external_id

        const response = await fetch(
          `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to delete webhook: ${response.status}`)
        }

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted Airtable webhook: ${webhookId}`)
      } catch (error) {
        logger.error(`❌ Failed to delete webhook ${resource.external_id}:`, error)
        // Mark as error but continue with others
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Delete Airtable trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Airtable webhooks
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'airtable')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhooks found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if any webhooks are expiring soon (within 7 days)
    const now = new Date()
    const expiringThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const expiringSoon = resources.some(r => {
      if (!r.expires_at) return false
      return new Date(r.expires_at) < expiringThreshold
    })

    const nearestExpiration = resources
      .filter(r => r.expires_at)
      .map(r => new Date(r.expires_at!))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    return {
      healthy: !expiringSoon,
      details: expiringSoon
        ? `Webhook expiring soon: ${nearestExpiration?.toISOString()}`
        : `All webhooks healthy (${resources.length} active)`,
      expiresAt: nearestExpiration?.toISOString(),
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get webhook callback URL
   */
  private getWebhookUrl(): string {
    return getWebhookUrl('/api/workflow/airtable')
  }
}
