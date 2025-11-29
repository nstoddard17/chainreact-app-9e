/**
 * Monday.com Trigger Lifecycle
 *
 * Manages webhooks for Monday.com triggers
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
  process.env.SUPABASE_SECRET_KEY!
)

export class MondayTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Monday.com trigger
   * Creates a webhook for the specified board
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Monday.com trigger for workflow ${workflowId}`, {
      triggerType,
      boardId: config.boardId
    })

    // Get user's Monday.com integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'monday')
      .single()

    if (!integration) {
      throw new Error('Monday.com integration not found for user')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Monday.com access token')
    }

    const { boardId, columnId } = config

    if (!boardId) {
      throw new Error('Board ID is required for Monday.com trigger')
    }

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    logger.debug(`📤 Creating Monday.com webhook`, {
      boardId,
      columnId: columnId || 'all columns',
      webhookUrl
    })

    // Determine event type based on trigger type
    const event = this.getEventForTriggerType(triggerType)

    // Build GraphQL mutation
    const mutation = `
      mutation($boardId: ID!, $url: String!, $event: WebhookEventType!) {
        create_webhook(board_id: $boardId, url: $url, event: $event) {
          id
          board_id
        }
      }
    `

    const variables = {
      boardId: boardId.toString(),
      url: `${webhookUrl}?workflowId=${workflowId}`,
      event
    }

    // Create webhook in Monday.com
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query: mutation, variables })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create Monday.com webhook: ${response.status} ${errorText}`)
    }

    const data = await response.json()

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(', ')
      throw new Error(`Monday.com error: ${errorMessages}`)
    }

    const webhook = data.data?.create_webhook

    if (!webhook) {
      throw new Error('Failed to create webhook: No data returned')
    }

    // Store in trigger_resources table
    const { error: insertError } = await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'monday',
      provider_id: 'monday',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhook.id,
      external_id: webhook.id,
      config: {
        boardId,
        columnId,
        webhookUrl: `${webhookUrl}?workflowId=${workflowId}`,
        event
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      // The webhook was already created successfully with Monday.com, so we can continue
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Monday.com webhook created (without local record): ${webhook.id}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Monday.com webhook created: ${webhook.id}`)
  }

  /**
   * Deactivate Monday.com trigger
   * Deletes the webhook
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating Monday.com triggers for workflow ${workflowId}`)

    // Get all Monday.com webhooks for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'monday')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Monday.com webhooks for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'monday')
      .single()

    if (!integration) {
      logger.warn(`⚠️ Monday.com integration not found, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'monday')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      logger.warn(`⚠️ Failed to decrypt Monday.com access token, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'monday')
      return
    }

    // Delete each webhook
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        const webhookId = resource.external_id

        // Build GraphQL mutation
        const mutation = `
          mutation($webhookId: ID!) {
            delete_webhook(id: $webhookId) {
              id
            }
          }
        `

        const variables = {
          webhookId: webhookId.toString()
        }

        const response = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'API-Version': '2024-01'
          },
          body: JSON.stringify({ query: mutation, variables })
        })

        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to delete webhook: ${response.status}`)
        }

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted Monday.com webhook: ${webhookId}`)
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
   * Delete Monday.com trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Monday.com webhooks
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'monday')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhooks found',
        lastChecked: new Date().toISOString()
      }
    }

    // All webhooks are healthy if they exist
    return {
      healthy: true,
      details: `All webhooks healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get webhook callback URL
   */
  private getWebhookUrl(): string {
    return getWebhookUrl('/api/workflow/monday')
  }

  /**
   * Map trigger type to Monday.com event type
   */
  private getEventForTriggerType(triggerType: string): string {
    const eventMap: Record<string, string> = {
      'monday_trigger_new_item': 'create_item',
      'monday_trigger_column_changed': 'change_column_value'
    }

    return eventMap[triggerType] || 'create_item'
  }
}
