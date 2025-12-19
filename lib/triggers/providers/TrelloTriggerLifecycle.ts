/**
 * Trello Trigger Lifecycle
 *
 * Manages webhooks for Trello triggers
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 *
 * Trello Webhook Documentation:
 * https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/
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

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class TrelloTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Trello trigger
   * Creates a webhook for the specified board/list/card
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Trello trigger for workflow ${workflowId}`, {
      triggerType,
      boardId: config.boardId,
      listId: config.listId
    })

    // Get user's Trello integration
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'trello')
      .single()

    if (!integration) {
      throw new Error('Trello integration not found for user')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Trello access token')
    }

    const { boardId } = config

    if (!boardId) {
      throw new Error('Board ID is required for Trello trigger')
    }

    // Get Trello API key
    const apiKey = process.env.TRELLO_CLIENT_ID || process.env.TRELLO_API_KEY

    if (!apiKey) {
      throw new Error('TRELLO_CLIENT_ID or TRELLO_API_KEY environment variable not set')
    }

    // Get webhook callback URL
    const webhookUrl = getWebhookUrl('trello')

    logger.debug(`📤 Creating Trello webhook`, {
      boardId,
      webhookUrl,
      description: `ChainReact workflow ${workflowId}`
    })

    // Create webhook in Trello
    // Trello webhooks monitor a specific "model" (board, card, list, etc.)
    const response = await fetch(`https://api.trello.com/1/webhooks?key=${apiKey}&token=${accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        description: `ChainReact workflow ${workflowId} - ${triggerType}`,
        callbackURL: webhookUrl,
        idModel: boardId, // The board to watch
        active: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`❌ Failed to create Trello webhook: ${response.status} ${errorText}`)
      throw new Error(`Failed to create Trello webhook: ${response.status} ${errorText}`)
    }

    const webhook = await response.json()

    logger.debug(`✅ Trello webhook created:`, {
      id: webhook.id,
      idModel: webhook.idModel,
      callbackURL: webhook.callbackURL,
      active: webhook.active
    })

    // Store in trigger_resources table
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'trello',
      provider_id: 'trello',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhook.id,
      external_id: webhook.id,
      config: {
        boardId,
        listId: config.listId,
        cardId: config.cardId,
        watchedProperties: config.watchedProperties,
        watchedLists: config.watchedLists,
        webhookUrl: webhook.callbackURL,
        idModel: webhook.idModel
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Trello webhook created (without local record): ${webhook.id}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Trello trigger activated: ${triggerType} (webhook ${webhook.id})`)
  }

  /**
   * Deactivate Trello trigger
   * Deletes the webhook
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating Trello triggers for workflow ${workflowId}`)

    // Get all Trello triggers for this workflow
    const { data: triggers } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider', 'trello')

    if (!triggers || triggers.length === 0) {
      logger.debug(`No Trello triggers found for workflow ${workflowId}`)
      return
    }

    // Get user's Trello integration
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'trello')
      .single()

    if (!integration) {
      logger.warn(`Trello integration not found for user ${userId}, skipping webhook cleanup`)
      // Still delete the trigger resources from DB
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider', 'trello')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      logger.warn(`Failed to decrypt Trello access token, skipping webhook cleanup`)
      // Still delete the trigger resources from DB
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider', 'trello')
      return
    }

    const apiKey = process.env.TRELLO_CLIENT_ID || process.env.TRELLO_API_KEY

    // Delete each webhook from Trello
    for (const trigger of triggers) {
      const webhookId = trigger.resource_id || trigger.external_id

      if (webhookId) {
        try {
          logger.debug(`🗑️ Deleting Trello webhook: ${webhookId}`)

          const response = await fetch(
            `https://api.trello.com/1/webhooks/${webhookId}?key=${apiKey}&token=${accessToken}`,
            {
              method: 'DELETE'
            }
          )

          if (!response.ok) {
            const errorText = await response.text()
            logger.warn(`Failed to delete Trello webhook ${webhookId}: ${response.status} ${errorText}`)
          } else {
            logger.debug(`✅ Deleted Trello webhook: ${webhookId}`)
          }
        } catch (error) {
          logger.error(`Error deleting Trello webhook ${webhookId}:`, error)
        }
      }
    }

    // Delete trigger resources from database
    await getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider', 'trello')

    logger.debug(`✅ Trello triggers deactivated for workflow ${workflowId}`)
  }

  /**
   * Delete trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Trello trigger
   * Verifies webhook still exists in Trello
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    try {
      // Get trigger resources
      const { data: triggers } = await getSupabase()
        .from('trigger_resources')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('provider', 'trello')

      if (!triggers || triggers.length === 0) {
        return {
          healthy: false,
          message: 'No Trello triggers found'
        }
      }

      // Get user's Trello integration
      const { data: integration } = await getSupabase()
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'trello')
        .single()

      if (!integration) {
        return {
          healthy: false,
          message: 'Trello integration not connected'
        }
      }

      // Decrypt access token
      const accessToken = typeof integration.access_token === 'string'
        ? safeDecrypt(integration.access_token)
        : null

      if (!accessToken) {
        return {
          healthy: false,
          message: 'Failed to decrypt Trello access token'
        }
      }

      const apiKey = process.env.TRELLO_CLIENT_ID || process.env.TRELLO_API_KEY

      // Check if each webhook exists
      let allHealthy = true
      const webhookStatuses: string[] = []

      for (const trigger of triggers) {
        const webhookId = trigger.resource_id || trigger.external_id

        if (!webhookId) {
          allHealthy = false
          webhookStatuses.push('Missing webhook ID')
          continue
        }

        try {
          const response = await fetch(
            `https://api.trello.com/1/webhooks/${webhookId}?key=${apiKey}&token=${accessToken}`,
            {
              method: 'GET'
            }
          )

          if (!response.ok) {
            allHealthy = false
            webhookStatuses.push(`Webhook ${webhookId}: ${response.status}`)
          } else {
            const webhook = await response.json()
            if (!webhook.active) {
              allHealthy = false
              webhookStatuses.push(`Webhook ${webhookId}: inactive`)
            } else {
              webhookStatuses.push(`Webhook ${webhookId}: active`)
            }
          }
        } catch (error) {
          allHealthy = false
          webhookStatuses.push(`Webhook ${webhookId}: error`)
        }
      }

      return {
        healthy: allHealthy,
        message: allHealthy
          ? `All ${triggers.length} webhook(s) active`
          : `Issues: ${webhookStatuses.join(', ')}`,
        details: {
          webhookCount: triggers.length,
          webhooks: webhookStatuses
        }
      }
    } catch (error: any) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`
      }
    }
  }

  /**
   * Get Trello event type for the trigger
   */
  private getEventTypeForTrigger(triggerType: string): string {
    const eventMap: Record<string, string> = {
      'trello_trigger_new_card': 'createCard',
      'trello_trigger_card_updated': 'updateCard',
      'trello_trigger_card_moved': 'moveCard',
      'trello_trigger_comment_added': 'commentCard',
      'trello_trigger_member_changed': 'memberCard',
      'trello_trigger_card_archived': 'archiveCard'
    }

    return eventMap[triggerType] || 'all'
  }
}
