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
import { safeDecrypt } from '@/lib/security/encryption'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class GoogleApisTriggerLifecycle implements TriggerLifecycle {
  private isGoogleSheetsTrigger(triggerType: string): boolean {
    return [
      'google_sheets_trigger_new_row',
      'google_sheets_trigger_updated_row',
      'google_sheets_trigger_new_worksheet'
    ].includes(triggerType)
  }

  /**
   * Activate Google API trigger
   * Creates a push notification subscription
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, providerId, config, testMode } = context

    const modeLabel = testMode ? '🧪 TEST' : '🔔 PRODUCTION'
    logger.debug(`${modeLabel} Activating Google API trigger for workflow ${workflowId}`, {
      triggerType,
      providerId,
      config,
      testSessionId: testMode?.testSessionId
    })

    // Get user's Google integration
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('id, access_token, refresh_token')
      .eq('user_id', userId)
      .or(`provider.eq.${providerId},provider.eq.google`)
      .single()

    if (!integration) {
      throw new Error(`Google integration not found for user (provider: ${providerId})`)
    }

    // Decrypt tokens
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null
    const refreshToken = typeof integration.refresh_token === 'string'
      ? safeDecrypt(integration.refresh_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Google access token')
    }

    // Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    if (this.isGoogleSheetsTrigger(triggerType)) {
      const spreadsheetId = config?.spreadsheetId
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID is required for Google Sheets triggers')
      }

      if (!integration?.id) {
        throw new Error('Google Sheets integration ID not found')
      }

      const triggerTypeMap: Record<string, 'new_row' | 'updated_row' | 'new_worksheet'> = {
        google_sheets_trigger_new_row: 'new_row',
        google_sheets_trigger_updated_row: 'updated_row',
        google_sheets_trigger_new_worksheet: 'new_worksheet'
      }

      const watchTriggerType = triggerTypeMap[triggerType]
      if (!watchTriggerType) {
        throw new Error(`Unknown Google Sheets trigger type: ${triggerType}`)
      }

      const webhookUrl = this.getWebhookUrl(providerId, testMode?.testSessionId)
      const { setupGoogleSheetsWatch } = await import('@/lib/webhooks/google-sheets-watch-setup')
      const watch = await setupGoogleSheetsWatch({
        userId,
        integrationId: integration.id,
        spreadsheetId,
        sheetName: config?.sheetName,
        triggerType: watchTriggerType,
        webhookUrl
      })

      const resourceData = {
        workflow_id: workflowId,
        user_id: userId,
        provider: providerId,
        provider_id: providerId,
        trigger_type: triggerType,
        node_id: nodeId,
        resource_type: 'subscription',
        resource_id: watch.channelId,
        external_id: watch.channelId,
        config: {
          ...config,
          integrationId: integration.id,
          spreadsheetId,
          sheetName: config?.sheetName,
          triggerType: watchTriggerType,
          resourceId: watch.resourceId,
          pageToken: watch.pageToken,
          lastRowCount: watch.lastRowCount ?? null,
          lastSheetCount: watch.lastSheetCount ?? null,
          sheetData: watch.sheetData || {},
          rowSignatures: watch.rowSignatures || {},
          api: 'sheets',
          webhookUrl
        },
        status: 'active',
        expires_at: watch.expiration,
        is_test: testMode?.isTest ?? false,
        test_session_id: testMode?.testSessionId ?? null
      }

      const { error: insertError } = await getSupabase().from('trigger_resources').insert(resourceData)

      if (insertError) {
        if (insertError.code === '23503') {
          logger.warn(`ƒsÿ‹,? Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
          logger.debug(`ƒo. Google Sheets watch created (without local record): ${watch.channelId}`)
          return
        }
        logger.error(`ƒ?O Failed to store trigger resource:`, insertError)
        throw new Error(`Failed to store trigger resource: ${insertError.message}`)
      }

      logger.debug(`ƒo. Google Sheets watch created: ${watch.channelId}`)
      return
    }

    // Get resource and API info based on trigger type
    const { api, resourceId, events } = this.getResourceInfo(triggerType, config)

    // Get webhook callback URL - use test URL if in test mode
    const webhookUrl = this.getWebhookUrl(providerId, testMode?.testSessionId)
    const channelId = testMode
      ? `chainreact-test-${testMode.testSessionId}-${Date.now()}`
      : `chainreact-${workflowId}-${Date.now()}`

    logger.debug(`📤 Creating Google push notification`, {
      api,
      resourceId,
      channelId,
      webhookUrl
    })

    let channelData: any

    try {
      switch (api) {
        case 'gmail':
          channelData = await this.createGmailWatch(oauth2Client, webhookUrl, channelId, config)
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
      logger.error(`Failed to create Google push notification:`, error)
      throw new Error(`Failed to create ${api} subscription: ${error.message}`)
    }

    // Store in trigger_resources table
    const resourceData = {
      workflow_id: workflowId,
      user_id: userId,
      provider: providerId, // Required NOT NULL column
      provider_id: providerId,
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'subscription',
      resource_id: channelData.resourceId || channelData.id, // Required NOT NULL column
      external_id: channelData.id,
      config: {
        ...config,
        channelId: channelData.id,
        resourceId: channelData.resourceId,
        api,
        events,
        webhookUrl // Store webhook URL for debugging
      },
      status: 'active',
      expires_at: channelData.expiration ? new Date(parseInt(channelData.expiration)).toISOString() : null,
      // Test mode isolation fields
      is_test: testMode?.isTest ?? false,
      test_session_id: testMode?.testSessionId ?? null
    }

    logger.debug(`📝 Storing trigger resource:`, resourceData)

    const { error: insertError } = await getSupabase().from('trigger_resources').insert(resourceData)

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      // The watch was already created successfully with Google, so we can continue
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Google ${api} push notification created (without local record): ${channelData.id}`)
        return // Don't throw - the watch is active, just not tracked locally
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Google ${api} push notification created: ${channelData.id}`)
    // Note: trigger_resources is the source of truth for Gmail triggers
    // Gmail processor has been updated to fall back to trigger_resources if no webhook_configs found
  }

  /**
   * Create Gmail watch
   * Gmail uses Google Cloud Pub/Sub instead of direct webhooks
   */
  private async createGmailWatch(auth: any, webhookUrl: string, channelId: string, config: any): Promise<any> {
    const gmail = google.gmail({ version: 'v1', auth })

    // Gmail requires a Pub/Sub topic, not a webhook URL
    const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC

    if (!pubsubTopic) {
      throw new Error('GMAIL_PUBSUB_TOPIC environment variable is not set. Gmail requires Google Cloud Pub/Sub to be configured.')
    }

    // Get labelIds from config, default to INBOX if not specified
    const labelIds = config?.labelIds && Array.isArray(config.labelIds) && config.labelIds.length > 0
      ? config.labelIds
      : ['INBOX']

    logger.debug(`📧 Creating Gmail watch with Pub/Sub topic: ${pubsubTopic}`, {
      labelIds,
      labelFilterAction: 'include'
    })

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: pubsubTopic, // Use Pub/Sub topic from environment
        labelIds: labelIds,
        labelFilterAction: 'include'
      }
    })

    logger.debug(`✅ Gmail watch created - historyId: ${response.data.historyId}`, {
      watchingFolders: labelIds.join(', ')
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
    const { workflowId, userId, nodeId, testSessionId } = context

    const modeLabel = testSessionId ? '🧪 TEST' : nodeId ? '🗑️ NODE' : '🛑 PRODUCTION'
    logger.debug(`${modeLabel} Deactivating Google API triggers for workflow ${workflowId}${nodeId ? ` node ${nodeId}` : ''}`)

    // Build query based on whether we're deactivating test or production triggers
    let query = getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .like('provider_id', 'google%')
      .eq('status', 'active')

    // Filter by specific node if provided (for node deletion)
    if (nodeId) {
      query = query.eq('node_id', nodeId)
    } else if (testSessionId) {
      // Only deactivate test subscriptions for this specific session
      query = query.eq('test_session_id', testSessionId)
    } else {
      // Deactivate production subscriptions only
      query = query.or('is_test.is.null,is_test.eq.false')
    }

    const { data: resources } = await query

    if (!resources || resources.length === 0) {
      const suffix = nodeId ? ` (node ${nodeId})` : testSessionId ? ` (session ${testSessionId})` : ''
      logger.debug(`ℹ️ No active Google API subscriptions for workflow ${workflowId}${suffix}`)
      return
    }

    // Get user's access token
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .or('provider.eq.google,provider.like.google%')
      .single()

    if (!integration) {
      logger.warn(`⚠️ Google integration not found, marking subscriptions as deleted`)
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .like('provider_id', 'google%')
      return
    }

    // Decrypt tokens
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null
    const refreshToken = typeof integration.refresh_token === 'string'
      ? safeDecrypt(integration.refresh_token)
      : null

    if (!accessToken) {
      logger.warn(`⚠️ Failed to decrypt Google access token, marking subscriptions as deleted`)
      await getSupabase()
        .from('trigger_resources')
        .delete()
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
      access_token: accessToken,
      refresh_token: refreshToken
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
          case 'sheets': {
            const integrationId = resource.config?.integrationId
            if (!integrationId) {
              throw new Error('Missing Google Sheets integration ID for watch cleanup')
            }
            const { stopGoogleSheetsWatch } = await import('@/lib/webhooks/google-sheets-watch-setup')
            await stopGoogleSheetsWatch(userId, integrationId, channelId, resourceId)
            break
          }
        }

        // Mark as deleted in trigger_resources
        await getSupabase()
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Stopped Google ${api} subscription: ${channelId}`)
      } catch (error) {
        logger.error(`❌ Failed to stop subscription ${resource.external_id}:`, error)
        await getSupabase()
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
    // Note: No need to clean up webhook_configs - we use trigger_resources as source of truth
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
    const { data: resources } = await getSupabase()
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
   *
   * @param providerId - The provider ID (gmail, google-calendar, etc.)
   * @param testSessionId - Optional test session ID for isolated test webhooks
   */
  private getWebhookUrl(providerId: string, testSessionId?: string): string {
    const baseUrl = getWebhookBaseUrl()

    // Map provider to webhook endpoint
    // All Google services share the same webhook handler at /api/webhooks/google
    // The handler determines the service from the event data
    const endpointMap: Record<string, string> = {
      'gmail': '/api/webhooks/google',
      'google-calendar': '/api/webhooks/google',
      'google-drive': '/api/webhooks/google',
      'google-sheets': '/api/webhooks/google',
      'google-docs': '/api/webhooks/google'
    }

    const baseEndpoint = endpointMap[providerId] || '/api/webhooks/google'

    // Use test-specific endpoint if in test mode
    // Test webhooks go to /api/webhooks/google/test/[sessionId]
    const endpoint = testSessionId
      ? `${baseEndpoint}/test/${testSessionId}`
      : baseEndpoint

    return `${baseUrl.replace(/\/$/, '')}${endpoint}`
  }
}
