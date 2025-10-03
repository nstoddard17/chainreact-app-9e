/**
 * Google APIs Trigger Lifecycle
 *
 * Manages push notifications for Google APIs (Gmail, Calendar, Drive, Sheets, Docs)
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 *
 * Google uses "push notifications" where you subscribe to changes on a resource.
 * Each subscription has a channel ID and expires after a certain time.
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class GoogleApisTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Google API trigger
   * Creates a push notification subscription
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, providerId, config } = context

    console.log(`🔔 Activating Google API trigger for workflow ${workflowId}`, {
      triggerType,
      providerId,
      config
    })

    // Get user's Google integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .or(`provider.eq.${providerId},provider.eq.google`)
      .single()

    if (!integration) {
      throw new Error(`Google integration not found for user (provider: ${providerId})`)
    }

    // Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token
    })

    // Get resource and API info based on trigger type
    const { api, resourceId, events } = this.getResourceInfo(triggerType, config)

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl(providerId)
    const channelId = `chainreact-${workflowId}-${Date.now()}`

    console.log(`📤 Creating Google push notification`, {
      api,
      resourceId,
      channelId,
      webhookUrl
    })

    let channelData: any

    try {
      switch (api) {
        case 'gmail':
          channelData = await this.createGmailWatch(oauth2Client, webhookUrl, channelId)
          break
        case 'calendar':
          channelData = await this.createCalendarWatch(oauth2Client, webhookUrl, channelId, resourceId)
          break
        case 'drive':
          channelData = await this.createDriveWatch(oauth2Client, webhookUrl, channelId, resourceId)
          break
        default:
          throw new Error(`Unsupported Google API: ${api}`)
      }
    } catch (error: any) {
      console.error(`Failed to create Google push notification:`, error)
      throw new Error(`Failed to create ${api} subscription: ${error.message}`)
    }

    // Store in trigger_resources table
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: providerId,
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'subscription',
      external_id: channelData.id,
      config: {
        ...config,
        channelId: channelData.id,
        resourceId: channelData.resourceId,
        api,
        events
      },
      status: 'active',
      expires_at: channelData.expiration ? new Date(parseInt(channelData.expiration)).toISOString() : null
    })

    console.log(`✅ Google ${api} push notification created: ${channelData.id}`)
  }

  /**
   * Create Gmail watch
   */
  private async createGmailWatch(auth: any, webhookUrl: string, channelId: string): Promise<any> {
    const gmail = google.gmail({ version: 'v1', auth })

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: webhookUrl, // For Gmail, this would be a Pub/Sub topic
        labelIds: ['INBOX'],
        labelFilterAction: 'include'
      }
    })

    return {
      id: channelId,
      resourceId: response.data.historyId,
      expiration: response.data.expiration
    }
  }

  /**
   * Create Calendar watch
   */
  private async createCalendarWatch(
    auth: any,
    webhookUrl: string,
    channelId: string,
    calendarId: string = 'primary'
  ): Promise<any> {
    const calendar = google.calendar({ version: 'v3', auth })

    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl
      }
    })

    return response.data
  }

  /**
   * Create Drive watch
   */
  private async createDriveWatch(
    auth: any,
    webhookUrl: string,
    channelId: string,
    fileId?: string
  ): Promise<any> {
    const drive = google.drive({ version: 'v3', auth })

    const response = await drive.files.watch({
      fileId: fileId || 'root',
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl
      }
    })

    return response.data
  }

  /**
   * Deactivate Google API trigger
   * Stops the push notification subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    console.log(`🛑 Deactivating Google API triggers for workflow ${workflowId}`)

    // Get all Google API subscriptions for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .like('provider_id', 'google%')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No active Google API subscriptions for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .or('provider.eq.google,provider.like.google%')
      .single()

    if (!integration) {
      console.warn(`⚠️ Google integration not found, marking subscriptions as deleted`)
      await supabase
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .like('provider_id', 'google%')
      return
    }

    // Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token
    })

    // Stop each subscription
    for (const resource of resources) {
      if (!resource.external_id || !resource.config?.api) continue

      try {
        const api = resource.config.api
        const channelId = resource.external_id
        const resourceId = resource.config.resourceId

        switch (api) {
          case 'gmail':
            await this.stopGmailWatch(oauth2Client)
            break
          case 'calendar':
            await this.stopCalendarWatch(oauth2Client, channelId, resourceId)
            break
          case 'drive':
            await this.stopDriveWatch(oauth2Client, channelId, resourceId)
            break
        }

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', resource.id)

        console.log(`✅ Stopped Google ${api} subscription: ${channelId}`)
      } catch (error) {
        console.error(`❌ Failed to stop subscription ${resource.external_id}:`, error)
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Stop Gmail watch
   */
  private async stopGmailWatch(auth: any): Promise<void> {
    const gmail = google.gmail({ version: 'v1', auth })
    await gmail.users.stop({ userId: 'me' })
  }

  /**
   * Stop Calendar watch
   */
  private async stopCalendarWatch(auth: any, channelId: string, resourceId: string): Promise<void> {
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId
      }
    })
  }

  /**
   * Stop Drive watch
   */
  private async stopDriveWatch(auth: any, channelId: string, resourceId: string): Promise<void> {
    const drive = google.drive({ version: 'v3', auth })
    await drive.channels.stop({
      requestBody: {
        id: channelId,
        resourceId: resourceId
      }
    })
  }

  /**
   * Delete Google API trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Google API subscriptions
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .like('provider_id', 'google%')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active subscriptions found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if any subscriptions are expiring soon (within 24 hours)
    const now = new Date()
    const expiringThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000)

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
        ? `Subscription expiring soon: ${nearestExpiration?.toISOString()}`
        : `All subscriptions healthy (${resources.length} active)`,
      expiresAt: nearestExpiration?.toISOString(),
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get resource info based on trigger type
   */
  private getResourceInfo(triggerType: string, config: any): {
    api: string
    resourceId: string | null
    events: string[]
  } {
    const resourceMap: Record<string, any> = {
      // Gmail
      'gmail_trigger_new_email': { api: 'gmail', resourceId: null, events: ['message'] },
      'gmail_trigger_email_received': { api: 'gmail', resourceId: null, events: ['message'] },

      // Calendar
      'google_calendar_trigger_event_created': { api: 'calendar', resourceId: config.calendarId || 'primary', events: ['created'] },
      'google_calendar_trigger_event_updated': { api: 'calendar', resourceId: config.calendarId || 'primary', events: ['updated'] },

      // Drive
      'google_drive_trigger_file_created': { api: 'drive', resourceId: config.fileId || 'root', events: ['created'] },
      'google_drive_trigger_file_modified': { api: 'drive', resourceId: config.fileId || 'root', events: ['updated'] },
      'google_drive_trigger_file_shared': { api: 'drive', resourceId: config.fileId || 'root', events: ['shared'] }
    }

    const info = resourceMap[triggerType]
    if (!info) {
      throw new Error(`Unknown Google trigger type: ${triggerType}`)
    }

    return info
  }

  /**
   * Get webhook callback URL
   */
  private getWebhookUrl(providerId: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
                    process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ||
                    process.env.PUBLIC_WEBHOOK_BASE_URL

    if (!baseUrl) {
      throw new Error('Webhook base URL not configured')
    }

    // Map provider to webhook endpoint
    const endpointMap: Record<string, string> = {
      'gmail': '/api/webhooks/google/gmail',
      'google-calendar': '/api/webhooks/google/calendar',
      'google-drive': '/api/webhooks/google/drive',
      'google-sheets': '/api/webhooks/google/sheets',
      'google-docs': '/api/webhooks/google/docs'
    }

    const endpoint = endpointMap[providerId] || `/api/webhooks/google/${providerId}`
    return `${baseUrl.replace(/\/$/, '')}${endpoint}`
  }
}
