/**
 * Mailchimp Trigger Lifecycle
 *
 * Manages Mailchimp webhook endpoints for triggers
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 *
 * Mailchimp Webhook Events Supported:
 * - subscribe: New subscriber added
 * - unsubscribe: Subscriber unsubscribed
 * - profile: Profile updated
 * - cleaned: Email cleaned (bounced)
 * - upemail: Email address changed
 * - campaign: Campaign sent
 *
 * Note: Mailchimp webhooks are list-specific, so we create one webhook per audience
 */

import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'
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

interface MailchimpAuthData {
  accessToken: string
  dc: string // Data center (e.g., us1, us19)
}

export class MailchimpTriggerLifecycle implements TriggerLifecycle {

  /**
   * Get Mailchimp auth data for user
   */
  private async getMailchimpAuth(userId: string): Promise<MailchimpAuthData> {
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('access_token, metadata')
      .eq('user_id', userId)
      .eq('provider', 'mailchimp')
      .single()

    if (!integration) {
      throw new Error('Mailchimp integration not found for user')
    }

    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Mailchimp access token')
    }

    // Extract data center from metadata
    const dc = integration.metadata?.dc || 'us1'

    return { accessToken, dc }
  }

  /**
   * Get webhook callback URL
   */
  private getWebhookUrl(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.chainreact.app'
    return `${baseUrl}/api/webhooks/mailchimp`
  }

  /**
   * Map trigger types to Mailchimp webhook events
   */
  private getEventsForTrigger(triggerType: string): {
    subscribe?: boolean
    unsubscribe?: boolean
    profile?: boolean
    cleaned?: boolean
    upemail?: boolean
    campaign?: boolean
  } {
    switch (triggerType) {
      case 'mailchimp_trigger_new_subscriber':
        return { subscribe: true }

      case 'mailchimp_trigger_unsubscribed':
        return { unsubscribe: true }

      case 'mailchimp_trigger_subscriber_updated':
        // Profile updates AND new subscribers
        return { subscribe: true, profile: true, upemail: true }

      case 'mailchimp_trigger_subscriber_added_to_segment':
        // Segment membership is tracked via profile updates
        return { profile: true }

      case 'mailchimp_trigger_link_clicked':
      case 'mailchimp_trigger_email_opened':
        // These require polling - Mailchimp doesn't webhook campaign activity
        return {}

      case 'mailchimp_trigger_new_campaign':
        return { campaign: true }

      case 'mailchimp_trigger_segment_updated':
      case 'mailchimp_trigger_new_audience':
        // These require polling - no webhook support
        return {}

      default:
        logger.warn(`Unknown Mailchimp trigger type: ${triggerType}`)
        return {}
    }
  }

  /**
   * Extract audience ID from config
   */
  private getAudienceId(config: any): string | null {
    return config?.audienceId || config?.audience_id || null
  }

  /**
   * Activate Mailchimp trigger
   * Creates a webhook endpoint for the specific audience
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Mailchimp trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get events for this trigger
    const events = this.getEventsForTrigger(triggerType)
    const hasWebhookEvents = Object.values(events).some(v => v === true)

    // If no webhook events, use polling fallback
    if (!hasWebhookEvents) {
      logger.debug(`📊 Trigger ${triggerType} will use polling (no webhook support)`, {
        triggerType
      })

      // Store in trigger_resources with polling config
      const { error: insertError } = await getSupabase().from('trigger_resources').insert({
        workflow_id: workflowId,
        user_id: userId,
        provider: 'mailchimp',
        provider_id: 'mailchimp',
        trigger_type: triggerType,
        node_id: nodeId,
        resource_type: 'polling',
        config: {
          ...config,
          pollInterval: 300000, // 5 minutes
          triggerType
        },
        created_at: new Date().toISOString()
      })

      if (insertError) {
        logger.error('Failed to store Mailchimp polling trigger:', {
          error: insertError,
          workflowId,
          triggerType
        })
        throw new Error(`Failed to store trigger resource: ${insertError.message}`)
      }

      return
    }

    // Get audience ID for list-specific triggers
    const audienceId = this.getAudienceId(config)

    // For audience-wide triggers, we need an audience ID
    if (!audienceId && triggerType !== 'mailchimp_trigger_new_audience') {
      throw new Error('Audience ID is required for this trigger type')
    }

    // Get Mailchimp auth
    const { accessToken, dc } = await getMailchimpAuth(userId)

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    // Include workflow ID and node ID in URL for routing
    const fullWebhookUrl = `${webhookUrl}?workflowId=${workflowId}&nodeId=${nodeId}`

    logger.debug(`📤 Creating Mailchimp webhook`, {
      audienceId,
      webhookUrl: fullWebhookUrl,
      events
    })

    // Create webhook via Mailchimp API
    const response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/webhooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: fullWebhookUrl,
          events,
          sources: {
            user: true,
            admin: true,
            api: true
          }
        })
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`
      logger.error('Failed to create Mailchimp webhook', {
        status: response.status,
        error: errorMessage
      })
      throw new Error(`Failed to create Mailchimp webhook: ${errorMessage}`)
    }

    const webhook = await response.json()

    logger.debug(`✅ Created Mailchimp webhook`, {
      webhookId: webhook.id,
      audienceId
    })

    // Store in trigger_resources table
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'mailchimp',
      provider_id: 'mailchimp',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhook.id,
      external_id: webhook.id,
      config: {
        ...config,
        audienceId,
        webhookUrl: webhook.url,
        webhookId: webhook.id,
        events
      },
      created_at: new Date().toISOString()
    })

    if (insertError) {
      logger.error('Failed to store trigger resource', { error: insertError })

      // Clean up webhook if we failed to store the record
      try {
        await fetch(
          `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/webhooks/${webhook.id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )
      } catch (cleanupError) {
        logger.error('Failed to cleanup webhook after storage error', { error: cleanupError })
      }

      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.info(`✅ Mailchimp trigger activated successfully`, {
      workflowId,
      triggerType,
      webhookId: webhook.id
    })
  }

  /**
   * Deactivate Mailchimp trigger
   * Deletes the webhook endpoint
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId, nodeId } = context

    logger.debug(`🔕 Deactivating Mailchimp trigger for workflow ${workflowId}`)

    // Get trigger resource
    const { data: resource } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .eq('provider', 'mailchimp')
      .single()

    if (!resource) {
      logger.warn('No trigger resource found to deactivate', { workflowId, nodeId })
      return
    }

    // If polling-based trigger, just delete the record
    if (resource.resource_type === 'polling') {
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)

      logger.debug('✅ Polling trigger deactivated')
      return
    }

    // Get Mailchimp auth
    const { accessToken, dc } = await this.getMailchimpAuth(userId)

    const webhookId = resource.resource_id || resource.external_id
    const audienceId = resource.config?.audienceId

    if (!webhookId || !audienceId) {
      logger.warn('Missing webhook ID or audience ID, skipping webhook deletion', {
        webhookId,
        audienceId
      })
    } else {
      // Delete webhook from Mailchimp
      try {
        const response = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/webhooks/${webhookId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!response.ok && response.status !== 404) {
          const errorData = await response.json().catch(() => ({}))
          logger.error('Failed to delete Mailchimp webhook', {
            status: response.status,
            error: errorData
          })
        } else {
          logger.debug(`✅ Deleted Mailchimp webhook ${webhookId}`)
        }
      } catch (error: any) {
        logger.error('Error deleting Mailchimp webhook', { error: error.message })
      }
    }

    // Delete from trigger_resources table
    const { error: deleteError } = await getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)

    if (deleteError) {
      logger.error('Failed to delete trigger resource', { error: deleteError })
      throw new Error(`Failed to delete trigger resource: ${deleteError.message}`)
    }

    logger.info(`✅ Mailchimp trigger deactivated successfully`, { workflowId })
  }

  /**
   * Handle trigger deletion
   * Same as deactivation for Mailchimp
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Mailchimp trigger
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    try {
      // Get trigger resource
      const { data: resource } = await getSupabase()
        .from('trigger_resources')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('provider', 'mailchimp')
        .single()

      if (!resource) {
        return {
          healthy: false,
          message: 'Trigger resource not found'
        }
      }

      // Polling triggers are always healthy if they exist
      if (resource.resource_type === 'polling') {
        return {
          healthy: true,
          message: 'Polling trigger active'
        }
      }

      // For webhook triggers, verify the webhook still exists
      const { accessToken, dc } = await this.getMailchimpAuth(userId)
      const webhookId = resource.resource_id
      const audienceId = resource.config?.audienceId

      if (!webhookId || !audienceId) {
        return {
          healthy: false,
          message: 'Missing webhook configuration'
        }
      }

      // Check if webhook exists
      const response = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/webhooks/${webhookId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (response.ok) {
        return {
          healthy: true,
          message: 'Webhook active and healthy'
        }
      } else if (response.status === 404) {
        return {
          healthy: false,
          message: 'Webhook not found in Mailchimp (may have been deleted)'
        }
      } else {
        return {
          healthy: false,
          message: `Webhook health check failed: HTTP ${response.status}`
        }
      }
    } catch (error: any) {
      logger.error('Error checking Mailchimp trigger health', { error: error.message })
      return {
        healthy: false,
        message: `Health check error: ${error.message}`
      }
    }
  }
}
