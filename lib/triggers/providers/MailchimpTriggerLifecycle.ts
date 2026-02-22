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
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'
import { logger } from '@/lib/utils/logger'
import { getMailchimpAuth } from '@/lib/workflows/actions/mailchimp/utils'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class MailchimpTriggerLifecycle implements TriggerLifecycle {

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
    // Mailchimp requires all event fields to be explicitly set (true/false)
    const allFalse = { subscribe: false, unsubscribe: false, profile: false, cleaned: false, upemail: false, campaign: false }

    switch (triggerType) {
      case 'mailchimp_trigger_new_subscriber':
        return { ...allFalse, subscribe: true }

      case 'mailchimp_trigger_unsubscribed':
        return { ...allFalse, unsubscribe: true }

      case 'mailchimp_trigger_subscriber_updated':
        // Profile updates AND new subscribers
        return { ...allFalse, subscribe: true, profile: true, upemail: true }

      case 'mailchimp_trigger_subscriber_added_to_segment':
        // Segment membership is tracked via profile updates
        return { ...allFalse, profile: true }

      case 'mailchimp_trigger_link_clicked':
      case 'mailchimp_trigger_email_opened':
        // These require polling - Mailchimp doesn't webhook campaign activity
        return {}

      case 'mailchimp_trigger_new_campaign':
        return { ...allFalse, campaign: true }

      case 'mailchimp_trigger_campaign_created':
        // Polling-based: Mailchimp campaign webhook only fires on SEND
        // Polling detects all campaign statuses (save, schedule, sent, etc.)
        return {}

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

    logger.info(`🔔 Activating Mailchimp trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get events for this trigger
    const events = this.getEventsForTrigger(triggerType)
    const hasWebhookEvents = Object.values(events).some(v => v === true)

    // If no webhook events, use polling fallback
    if (!hasWebhookEvents) {
      logger.info(`📊 Trigger ${triggerType} will use polling (no webhook support)`, {
        triggerType
      })

      // Capture initial snapshot to prevent "first poll miss" bug
      let initialSnapshot: any = null
      try {
        const { accessToken, dc } = await getMailchimpAuth(userId)
        initialSnapshot = await this.captureInitialSnapshot(triggerType, config, accessToken, dc)
        logger.info('[Mailchimp] Initial snapshot captured', { triggerType })
      } catch (snapshotError: any) {
        logger.warn('[Mailchimp] Failed to capture initial snapshot, will establish baseline on first poll', {
          error: snapshotError.message
        })
      }

      // Store in trigger_resources with polling config (upsert to handle reactivation)
      const { error: upsertError } = await getSupabase().from('trigger_resources').upsert({
        workflow_id: workflowId,
        user_id: userId,
        provider: 'mailchimp',
        provider_id: 'mailchimp',
        trigger_type: triggerType,
        node_id: nodeId,
        resource_type: 'polling',
        resource_id: `poll-${workflowId}-${nodeId}`,
        config: {
          ...config,
          pollingEnabled: true,
          pollInterval: 300000, // 5 minutes
          triggerType,
          ...(initialSnapshot ? { mailchimpSnapshot: initialSnapshot } : {})
        },
        status: 'active',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'provider,resource_type,resource_id'
      })

      if (upsertError) {
        logger.error('Failed to store Mailchimp polling trigger:', {
          error: upsertError,
          workflowId,
          triggerType
        })
        throw new Error(`Failed to store trigger resource: ${upsertError.message}`)
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

    logger.info(`📤 Creating Mailchimp webhook`, {
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
        error: errorMessage,
        errors: errorData.errors
      })
      throw new Error(`Failed to create Mailchimp webhook: ${errorMessage}`)
    }

    const webhook = await response.json()

    logger.info(`✅ Created Mailchimp webhook`, {
      webhookId: webhook.id,
      audienceId
    })

    // Store in trigger_resources table (upsert to handle reactivation)
    const { error: upsertError } = await getSupabase().from('trigger_resources').upsert({
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
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'provider,resource_type,resource_id'
    })

    if (upsertError) {
      logger.error('Failed to store trigger resource', { error: upsertError })

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

      throw new Error(`Failed to store trigger resource: ${upsertError.message}`)
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

    logger.info(`🔕 Deactivating Mailchimp trigger for workflow ${workflowId}`)

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

      logger.info('✅ Polling trigger deactivated')
      return
    }

    // Get Mailchimp auth
    const { accessToken, dc } = await getMailchimpAuth(userId)

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
          logger.info(`✅ Deleted Mailchimp webhook ${webhookId}`)
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
      const { accessToken, dc } = await getMailchimpAuth(userId)
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

  /**
   * Capture initial snapshot for polling triggers to prevent "first poll miss" bug
   */
  private async captureInitialSnapshot(
    triggerType: string,
    config: any,
    accessToken: string,
    dc: string
  ): Promise<any> {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }

    switch (triggerType) {
      case 'mailchimp_trigger_email_opened': {
        const campaignId = config.campaignId
        if (campaignId) {
          const resp = await fetch(
            `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
            { headers }
          )
          if (resp.ok) {
            const report = await resp.json()
            return {
              type: 'email_opened',
              campaigns: { [campaignId]: { totalOpens: report.opens?.opens_total || 0 } },
              updatedAt: new Date().toISOString()
            }
          }
        }
        // No specific campaign - snapshot recent campaigns
        const resp = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
          { headers }
        )
        if (resp.ok) {
          const data = await resp.json()
          const campaigns: Record<string, any> = {}
          for (const c of data.campaigns || []) {
            campaigns[c.id] = { totalOpens: c.report_summary?.opens || 0 }
          }
          return { type: 'email_opened', campaigns, updatedAt: new Date().toISOString() }
        }
        return { type: 'email_opened', campaigns: {}, updatedAt: new Date().toISOString() }
      }

      case 'mailchimp_trigger_link_clicked': {
        const campaignId = config.campaignId
        if (campaignId) {
          const resp = await fetch(
            `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
            { headers }
          )
          if (resp.ok) {
            const report = await resp.json()
            return {
              type: 'link_clicked',
              campaigns: { [campaignId]: { totalClicks: report.clicks?.clicks_total || 0 } },
              updatedAt: new Date().toISOString()
            }
          }
        }
        const resp = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
          { headers }
        )
        if (resp.ok) {
          const data = await resp.json()
          const campaigns: Record<string, any> = {}
          for (const c of data.campaigns || []) {
            campaigns[c.id] = { totalClicks: c.report_summary?.clicks || 0 }
          }
          return { type: 'link_clicked', campaigns, updatedAt: new Date().toISOString() }
        }
        return { type: 'link_clicked', campaigns: {}, updatedAt: new Date().toISOString() }
      }

      case 'mailchimp_trigger_segment_updated': {
        const audienceId = config.audienceId || config.audience_id
        if (!audienceId) return { type: 'segment_updated', segments: {}, updatedAt: new Date().toISOString() }

        const resp = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/segments?count=100`,
          { headers }
        )
        if (resp.ok) {
          const data = await resp.json()
          const segments: Record<string, any> = {}
          for (const s of data.segments || []) {
            segments[s.id] = {
              name: s.name,
              memberCount: s.member_count,
              updatedAt: s.updated_at
            }
          }
          return { type: 'segment_updated', segments, updatedAt: new Date().toISOString() }
        }
        return { type: 'segment_updated', segments: {}, updatedAt: new Date().toISOString() }
      }

      case 'mailchimp_trigger_new_audience': {
        const resp = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/lists?count=100`,
          { headers }
        )
        if (resp.ok) {
          const data = await resp.json()
          const audienceIds = (data.lists || []).map((l: any) => l.id)
          return { type: 'new_audience', audienceIds, updatedAt: new Date().toISOString() }
        }
        return { type: 'new_audience', audienceIds: [], updatedAt: new Date().toISOString() }
      }

      case 'mailchimp_trigger_campaign_created': {
        const statusFilter = config?.status
        const audienceFilter = config?.audienceId || config?.audience_id

        let url = `https://${dc}.api.mailchimp.com/3.0/campaigns?sort_field=create_time&sort_dir=DESC&count=50`
        if (statusFilter && statusFilter !== 'all') {
          url += `&status=${statusFilter}`
        }
        if (audienceFilter) {
          url += `&list_id=${audienceFilter}`
        }

        const resp = await fetch(url, { headers })
        if (resp.ok) {
          const data = await resp.json()
          const campaignIds = (data.campaigns || []).map((c: any) => c.id)
          return { type: 'new_campaign', campaignIds, updatedAt: new Date().toISOString() }
        }
        return { type: 'new_campaign', campaignIds: [], updatedAt: new Date().toISOString() }
      }

      default:
        return null
    }
  }
}
