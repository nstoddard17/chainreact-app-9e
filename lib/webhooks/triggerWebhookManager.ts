import { createClient } from '@supabase/supabase-js'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { getWebhookBaseUrl, getWebhookUrl } from '@/lib/utils/getBaseUrl'

interface WebhookTriggerConfig {
  workflowId: string
  userId: string
  triggerType: string
  providerId: string
  config: Record<string, any>
  webhookUrl: string
  secret?: string
}

interface WebhookPayload {
  workflowId: string
  triggerType: string
  providerId: string
  data: any
  timestamp: string
  signature?: string
}

export class TriggerWebhookManager {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /**
   * Get all triggers that support webhooks
   */
  getWebhookSupportedTriggers() {
    return ALL_NODE_COMPONENTS.filter(node => 
      node.isTrigger && this.supportsWebhooks(node)
    )
  }

  /**
   * Check if a trigger supports webhooks
   */
  supportsWebhooks(trigger: any): boolean {
    const webhookSupportedTriggers = [
      'gmail_trigger_new_email',
      'gmail_trigger_new_attachment', 
      'gmail_trigger_new_label',
      'google_calendar_trigger_new_event',
      'google_calendar_trigger_event_updated',
      'google_calendar_trigger_event_canceled',
      'google-drive:new_file_in_folder',
      'google-drive:new_folder_in_folder',
      'google-drive:file_updated',
      'google_sheets_trigger_new_row',
      'google_sheets_trigger_new_worksheet',
      'google_sheets_trigger_updated_row',
      'slack_trigger_new_message',
      'slack_trigger_channel_created',
      'slack_trigger_user_joined',
      'github_trigger_new_issue',
      'github_trigger_issue_updated',
      'github_trigger_new_pr',
      'github_trigger_pr_updated',
      'notion_trigger_new_page',
      'notion_trigger_page_updated',
      'hubspot_trigger_new_contact',
      'hubspot_trigger_contact_updated',
      'airtable_trigger_new_record',
      'airtable_trigger_record_updated',
      'airtable_trigger_table_deleted',
      'discord_trigger_new_message',
      'discord_trigger_member_join',
      'discord_trigger_slash_command',
      'discord_trigger_reaction_added'
    ]
    
    return webhookSupportedTriggers.includes(trigger.type)
  }

  /**
   * Register a webhook for a workflow trigger
   */
  async registerWebhook(config: WebhookTriggerConfig): Promise<string> {
    try {
      // Generate webhook secret if not provided
      const secret = config.secret || this.generateWebhookSecret()
      
      // Create webhook configuration
      const { data: webhookConfig, error } = await this.supabase
        .from('webhook_configs')
        .insert({
          workflow_id: config.workflowId,
          user_id: config.userId,
          trigger_type: config.triggerType,
          provider_id: config.providerId,
          webhook_url: config.webhookUrl,
          secret: secret,
          status: 'active',
          config: config.config
        })
        .select()
        .single()

      if (error) throw error

      // Register with external service if needed
      await this.registerWithExternalService(config, webhookConfig.id)

      return webhookConfig.id
    } catch (error) {
      console.error('Error registering webhook:', error)
      throw error
    }
  }

  /**
   * Unregister all webhooks for a workflow
   */
  async unregisterWorkflowWebhooks(workflowId: string): Promise<void> {
    try {
      console.log(`🔗 Unregistering all webhooks for workflow ${workflowId}`)

      // Get all webhook configs for this workflow
      const { data: webhookConfigs, error } = await this.supabase
        .from('webhook_configs')
        .select('*')
        .eq('workflow_id', workflowId)

      if (error) {
        console.error('Failed to fetch webhook configs:', error)
        return
      }

      if (!webhookConfigs || webhookConfigs.length === 0) {
        console.log('No webhooks found for this workflow')
        return
      }

      // Unregister each webhook
      for (const config of webhookConfigs) {
        await this.unregisterWebhook(config.id)
      }

      console.log(`✅ Unregistered ${webhookConfigs.length} webhook(s) for workflow ${workflowId}`)
    } catch (error) {
      console.error('Failed to unregister workflow webhooks:', error)
      // Don't throw - best effort cleanup
    }
  }

  /**
   * Unregister a webhook
   */
  async unregisterWebhook(webhookId: string): Promise<void> {
    try {
      // Get webhook config
      const { data: webhookConfig } = await this.supabase
        .from('webhook_configs')
        .select('*')
        .eq('id', webhookId)
        .single()

      if (webhookConfig) {
        // Unregister from external service
        await this.unregisterFromExternalService(webhookConfig)
        
        // Delete from database
        await this.supabase
          .from('webhook_configs')
          .delete()
          .eq('id', webhookId)
      }
    } catch (error) {
      console.error('Error unregistering webhook:', error)
      throw error
    }
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhookPayload(webhookId: string, payload: any, headers: any): Promise<void> {
    try {
      // Get webhook configuration
      const { data: webhookConfig } = await this.supabase
        .from('webhook_configs')
        .select('*')
        .eq('id', webhookId)
        .single()

      if (!webhookConfig) {
        throw new Error('Webhook configuration not found')
      }

      // Validate payload signature if secret exists
      if (webhookConfig.secret && !this.validateSignature(payload, headers, webhookConfig.secret)) {
        throw new Error('Invalid webhook signature')
      }

      // Transform payload based on trigger type
      const transformedPayload = this.transformPayload(webhookConfig.trigger_type, payload)

      // Log webhook execution
      const executionId = await this.logWebhookExecution(webhookConfig, transformedPayload, headers)

      // Execute workflow
      await this.executeWorkflow(webhookConfig.workflow_id, transformedPayload, executionId)

      // Update last triggered timestamp
      await this.supabase
        .from('webhook_configs')
        .update({ last_triggered: new Date().toISOString() })
        .eq('id', webhookId)

    } catch (error) {
      console.error('Error processing webhook payload:', error)
      
      // Log error
      await this.logWebhookError(webhookId, error)
      
      throw error
    }
  }

  /**
   * Transform payload based on trigger type
   */
  private transformPayload(triggerType: string, payload: any): any {
    switch (triggerType) {
      case 'gmail_trigger_new_email':
        return this.transformGmailEmailPayload(payload)
      
      case 'gmail_trigger_new_attachment':
        return this.transformGmailAttachmentPayload(payload)
      
      case 'google_calendar_trigger_new_event':
        return this.transformGoogleCalendarEventPayload(payload)
      
      case 'google-drive:new_file_in_folder':
        return this.transformGoogleDriveFilePayload(payload)
      
      case 'google_sheets_trigger_new_row':
        return this.transformGoogleSheetsRowPayload(payload)
      
      case 'slack_trigger_new_message':
        return this.transformSlackMessagePayload(payload)
      
      case 'github_trigger_new_issue':
        return this.transformGithubIssuePayload(payload)
      
      case 'notion_trigger_new_page':
        return this.transformNotionPagePayload(payload)
      
      case 'hubspot_trigger_new_contact':
        return this.transformHubspotContactPayload(payload)
      
      case 'airtable_trigger_new_record':
      case 'airtable_trigger_record_updated':
      case 'airtable_trigger_table_deleted':
        return this.transformAirtableRecordPayload(payload)
      
      case 'discord_trigger_new_message':
        return this.transformDiscordMessagePayload(payload)
      
      default:
        return payload
    }
  }

  /**
   * Transform Gmail email payload
   */
  private transformGmailEmailPayload(payload: any): any {
    return {
      email: {
        id: payload.id,
        threadId: payload.threadId,
        labelIds: payload.labelIds,
        snippet: payload.snippet,
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
        attachments: payload.attachments || [],
        receivedAt: payload.receivedAt || new Date().toISOString()
      }
    }
  }

  /**
   * Transform Gmail attachment payload
   */
  private transformGmailAttachmentPayload(payload: any): any {
    return {
      email: {
        id: payload.emailId,
        threadId: payload.threadId,
        from: payload.from,
        subject: payload.subject,
        attachment: {
          id: payload.attachmentId,
          name: payload.attachmentName,
          size: payload.attachmentSize,
          mimeType: payload.attachmentMimeType
        }
      }
    }
  }

  /**
   * Transform Google Calendar event payload
   */
  private transformGoogleCalendarEventPayload(payload: any): any {
    return {
      event: {
        id: payload.id,
        summary: payload.summary,
        description: payload.description,
        start: payload.start,
        end: payload.end,
        location: payload.location,
        attendees: payload.attendees || [],
        organizer: payload.organizer,
        created: payload.created,
        updated: payload.updated
      }
    }
  }

  /**
   * Transform Google Drive file payload
   */
  private transformGoogleDriveFilePayload(payload: any): any {
    return {
      file: {
        id: payload.id,
        name: payload.name,
        mimeType: payload.mimeType,
        size: payload.size,
        parents: payload.parents || [],
        created: payload.created,
        modified: payload.modified,
        webViewLink: payload.webViewLink
      }
    }
  }

  /**
   * Transform Google Sheets row payload
   */
  private transformGoogleSheetsRowPayload(payload: any): any {
    return {
      row: {
        rowIndex: payload.rowIndex,
        values: payload.values,
        spreadsheetId: payload.spreadsheetId,
        sheetName: payload.sheetName,
        timestamp: payload.timestamp || new Date().toISOString()
      }
    }
  }

  /**
   * Transform Slack message payload
   */
  private transformSlackMessagePayload(payload: any): any {
    return {
      message: {
        id: payload.ts,
        text: payload.text,
        user: payload.user,
        channel: payload.channel,
        team: payload.team,
        timestamp: payload.ts,
        attachments: payload.attachments || []
      }
    }
  }

  /**
   * Transform GitHub issue payload
   */
  private transformGithubIssuePayload(payload: any): any {
    return {
      issue: {
        id: payload.id,
        number: payload.number,
        title: payload.title,
        body: payload.body,
        state: payload.state,
        user: payload.user,
        assignees: payload.assignees || [],
        labels: payload.labels || [],
        created_at: payload.created_at,
        updated_at: payload.updated_at
      }
    }
  }

  /**
   * Transform Notion page payload
   */
  private transformNotionPagePayload(payload: any): any {
    return {
      page: {
        id: payload.id,
        title: payload.title,
        properties: payload.properties,
        parent: payload.parent,
        created_time: payload.created_time,
        last_edited_time: payload.last_edited_time,
        url: payload.url
      }
    }
  }

  /**
   * Transform HubSpot contact payload
   */
  private transformHubspotContactPayload(payload: any): any {
    return {
      contact: {
        id: payload.id,
        properties: payload.properties,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt
      }
    }
  }

  /**
   * Transform Airtable record payload
   */
  private transformAirtableRecordPayload(payload: any): any {
    return {
      record: {
        id: payload.id,
        fields: payload.fields,
        createdTime: payload.createdTime,
        commentCount: payload.commentCount
      }
    }
  }

  /**
   * Transform Discord message payload
   */
  private transformDiscordMessagePayload(payload: any): any {
    return {
      message: {
        id: payload.id,
        content: payload.content,
        author: payload.author,
        channel_id: payload.channel_id,
        guild_id: payload.guild_id,
        timestamp: payload.timestamp,
        attachments: payload.attachments || []
      }
    }
  }

  /**
   * Register Discord webhook via Discord API
   */
  private async registerDiscordWebhook(config: WebhookTriggerConfig): Promise<void> {
    try {
      const { registerDiscordWebhook } = await import('./registration')
      
      const registration = {
        provider: 'discord',
        webhookUrl: config.webhookUrl,
        events: ['message_create'], // Discord event types
        secret: this.generateWebhookSecret(),
        config: config.config,
        userId: config.userId
      }
      
      await registerDiscordWebhook(registration)
      console.log('✅ Discord webhook registered successfully via API')
    } catch (error) {
      console.error('Failed to register Discord webhook:', error)
      throw error
    }
  }

  /**
   * Register Gmail watch for push notifications
   */
  private async registerGmailWatch(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    try {
      // Get user's Gmail integration
      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('user_id', config.userId)
        .eq('provider', 'gmail')
        .eq('status', 'connected')
        .single()

      if (!integration) {
        throw new Error('Gmail integration not found or not connected')
      }

      // Import Gmail watch setup function
      const { setupGmailWatch } = await import('./gmail-watch-setup')

      // Google Cloud Pub/Sub topic name
      const topicName = process.env.GMAIL_PUBSUB_TOPIC

      if (!topicName || topicName.includes('YOUR_PROJECT_ID')) {
        throw new Error('GMAIL_PUBSUB_TOPIC environment variable not configured. Please set it to your Google Cloud Pub/Sub topic.')
      }

      // Set up the watch
      const watchResult = await setupGmailWatch({
        userId: config.userId,
        integrationId: integration.id,
        topicName: topicName,
        labelIds: config.config?.labelIds || ['INBOX']
      })

      // Store the history ID and expiration in webhook config
      const expiration = watchResult.expiration ? new Date(watchResult.expiration) : (() => {
        const date = new Date()
        date.setDate(date.getDate() + 7)
        return date
      })()

      await this.supabase
        .from('webhook_configs')
        .update({
          config: {
            watch: {
              historyId: watchResult.historyId,
              emailAddress: watchResult.emailAddress,
              expiration: expiration.toISOString(),
              topicName: topicName
            }
          }
        })
        .eq('id', webhookId)

      console.log('✅ Gmail watch registered successfully, expires:', expiration.toISOString())
    } catch (error) {
      console.error('Failed to register Gmail watch:', error)
      throw error
    }
  }

  /**
   * Register Google Calendar watch
   */
  private async registerGoogleCalendarWatch(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    try {
      // Get user's Google Calendar integration
      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('user_id', config.userId)
        .eq('provider', 'google-calendar')
        .eq('status', 'connected')
        .single()

      if (!integration) {
        throw new Error('Google Calendar integration not found or not connected')
      }

      // Import Calendar watch setup function
      const { setupGoogleCalendarWatch } = await import('./google-calendar-watch-setup')

      // Extract calendar configuration (support multiple calendars or single)
      const calendars: string[] | null = Array.isArray(config.config?.calendars)
        ? (config.config?.calendars as string[])
        : null
      const calendarId = config.config?.calendarId || 'primary'
      const eventTypes = config.config?.eventTypes || []

      const targets = calendars && calendars.length > 0 ? calendars : [calendarId]

      const results: Array<{ calendarId: string; startTime: string; expiration: string }> = []
      for (const cal of targets) {
        const result = await setupGoogleCalendarWatch({
          userId: config.userId,
          integrationId: integration.id,
          calendarId: cal,
          eventTypes: eventTypes
        })
        results.push({ calendarId: cal, startTime: result.startTime, expiration: result.expiration })
      }

      const existingConfig = config.config || {}
      const firstStartTime = results[0]?.startTime || existingConfig.watch?.startTime || new Date().toISOString()

      const updatedConfig = {
        ...existingConfig,
        calendars: calendars && calendars.length > 0 ? calendars : undefined,
        calendarId: calendars && calendars.length > 0 ? undefined : calendarId,
        eventTypes,
        watch: {
          ...(existingConfig.watch || {}),
          // Keep a single watch metadata object for compatibility
          startTime: firstStartTime
        }
      }

      await this.supabase
        .from('webhook_configs')
        .update({ config: updatedConfig })
        .eq('id', webhookId)

      console.log('✅ Google Calendar watch registered successfully for', targets.length, 'calendar(s)')
    } catch (error) {
      console.error('Failed to register Google Calendar watch:', error)
      throw error
    }
  }

  /**
   * Register Google Drive watch
   */
  private async registerGoogleDriveWatch(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    try {
      // Get user's Google Drive integration
      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('user_id', config.userId)
        .eq('provider', 'google-drive')
        .eq('status', 'connected')
        .single()

      if (!integration) {
        throw new Error('Google Drive integration not found or not connected')
      }

      // Import Drive watch setup function
      const { setupGoogleDriveWatch } = await import('./google-drive-watch-setup')

      // Extract drive configuration
      const folderId = config.config?.folderId
      const includeRemoved = config.config?.includeRemoved || false

      // Set up the watch
      const result = await setupGoogleDriveWatch({
        userId: config.userId,
        integrationId: integration.id,
        folderId: folderId,
        includeRemoved: includeRemoved
      })

      // Store the watch details in webhook config
      await this.supabase
        .from('webhook_configs')
        .update({
          metadata: {
            channelId: result.channelId,
            resourceId: result.resourceId,
            expiration: result.expiration,
            folderId: folderId
          }
        })
        .eq('id', webhookId)

      console.log('✅ Google Drive watch registered successfully, expires:', result.expiration)
    } catch (error) {
      console.error('Failed to register Google Drive watch:', error)
      throw error
    }
  }

  /**
   * Register Google Sheets watch (using Drive API)
   */
  private async registerGoogleSheetsWatch(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    try {
      // Get user's Google Sheets integration
      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('user_id', config.userId)
        .eq('provider', 'google-sheets')
        .eq('status', 'connected')
        .single()

      if (!integration) {
        throw new Error('Google Sheets integration not found or not connected')
      }

      // Import Sheets watch setup function
      const { setupGoogleSheetsWatch } = await import('./google-sheets-watch-setup')

      // Extract sheets configuration
      const spreadsheetId = config.config?.spreadsheetId
      const sheetName = config.config?.sheetName
      const triggerType = config.triggerType.includes('new_row') ? 'new_row' :
                          config.triggerType.includes('updated_row') ? 'updated_row' : 'new_worksheet'

      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID is required for Google Sheets webhook registration')
      }

      // Set up the watch
      const result = await setupGoogleSheetsWatch({
        userId: config.userId,
        integrationId: integration.id,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        triggerType: triggerType as any
      })

      // Store the watch details in webhook config
      await this.supabase
        .from('webhook_configs')
        .update({
          metadata: {
            channelId: result.channelId,
            resourceId: result.resourceId,
            expiration: result.expiration,
            spreadsheetId: spreadsheetId,
            sheetName: sheetName,
            lastRowCount: result.lastRowCount
          }
        })
        .eq('id', webhookId)

      console.log('✅ Google Sheets watch registered successfully, expires:', result.expiration)
    } catch (error) {
      console.error('Failed to register Google Sheets watch:', error)
      throw error
    }
  }

  /**
   * Register webhook with external service
   */
  private async registerWithExternalService(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    // This integrates with external APIs to register webhooks
    console.log('🔗 registerWithExternalService called for provider:', config.providerId)
    
    switch (config.providerId) {
      case 'discord':
        // Discord webhooks are automatically created via Discord API
        console.log('🎯 Calling registerDiscordWebhook for config:', config)
        await this.registerDiscordWebhook(config)
        console.log('✅ registerDiscordWebhook completed')
        break
      
      case 'google-docs':
        // Google Docs changes arrive via Google Drive change notifications
        // Reuse Drive watch to detect document changes
        console.log('🔗 Setting up Google Docs watch via Drive change notifications')
        await this.registerGoogleDriveWatch({ ...config, providerId: 'google-drive', config: { ...(config.config || {}) }, contextProvider: 'google-docs' } as any, webhookId)
        break
        
      case 'gmail':
        // Gmail uses push notifications via Google Cloud Pub/Sub
        console.log('🔗 Setting up Gmail watch for webhook notifications')
        await this.registerGmailWatch(config, webhookId)
        break
      
      case 'google-calendar':
        // Google Calendar uses watch API
        console.log('🔗 Setting up Google Calendar watch for webhook notifications')
        await this.registerGoogleCalendarWatch(config, webhookId)
        break

      case 'google-drive':
        // Google Drive uses watch API
        console.log('🔗 Setting up Google Drive watch for webhook notifications')
        await this.registerGoogleDriveWatch(config, webhookId)
        break

      case 'google-sheets':
        // Google Sheets uses Drive watch API
        console.log('🔗 Setting up Google Sheets watch for webhook notifications')
        await this.registerGoogleSheetsWatch(config, webhookId)
        break

      case 'airtable':
        // Register Airtable webhook for the base
        console.log('🔗 Setting up Airtable webhook for base monitoring')
        await this.registerAirtableWebhook(config, webhookId)
        break

      case 'slack':
        // Slack webhooks are typically configured through Slack app settings
        console.log('Slack webhook registration would require Slack app configuration')
        break

      case 'github':
        // GitHub webhooks are configured through repository settings
        console.log('GitHub webhook registration would require repository webhook setup')
        break

      default:
        console.log(`Webhook registration for ${config.providerId} not yet implemented`)
    }
  }

  /**
   * Register Airtable webhook for base monitoring
   */
  private async registerAirtableWebhook(config: WebhookTriggerConfig, webhookId: string): Promise<void> {
    try {
      // Get user's Airtable integration
      const { data: integration } = await this.supabase
        .from('integrations')
        .select('*')
        .eq('user_id', config.userId)
        .eq('provider', 'airtable')
        .eq('status', 'connected')
        .single()

      if (!integration) {
        throw new Error('Airtable integration not found or not connected')
      }

      // Import Airtable webhook setup function
      const { ensureAirtableWebhookForBase } = await import('@/lib/integrations/airtable/webhooks')

      // Extract baseId and tableName from config
      const baseId = config.config?.baseId
      const tableName = config.config?.tableName

      if (!baseId) {
        throw new Error('Base ID is required for Airtable webhook registration')
      }

      console.log(`🔧 Registering Airtable webhook for base: ${baseId}, table: ${tableName || 'all tables'}`)

      // Get the webhook URL for Airtable (uses HTTPS in development via ngrok if configured)
      const webhookUrl = getWebhookUrl('airtable')
      console.log(`📢 Using webhook URL: ${webhookUrl}`)

      // Register webhook with Airtable (this handles creating or reusing existing webhook)
      await ensureAirtableWebhookForBase(config.userId, baseId, webhookUrl, tableName)

      const { data: airtableWebhook } = await this.supabase
        .from('airtable_webhooks')
        .select('metadata')
        .eq('user_id', config.userId)
        .eq('base_id', baseId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const tableId = config.config?.tableId || airtableWebhook?.metadata?.tableId || airtableWebhook?.metadata?.table_id || null

      // Store webhook configuration details
      await this.supabase
        .from('webhook_configs')
        .update({
          metadata: {
            baseId,
            tableName: config.config?.tableName || tableName || null,
            tableId,
            triggerType: config.triggerType,
          },
          config: {
            ...config.config,
            tableId
          }
        })
        .eq('id', webhookId)

      console.log('✅ Airtable webhook registered successfully for base:', baseId)
    } catch (error) {
      console.error('Failed to register Airtable webhook:', error)
      throw error
    }
  }

  /**
   * Unregister Discord webhook via Discord API
   */
  private async unregisterDiscordWebhook(webhookConfig: any): Promise<void> {
    try {
      // Get the Discord webhook details from our database
      const { data: registration } = await this.supabase
        .from('webhook_registrations')
        .select('*')
        .eq('provider', 'discord')
        .eq('webhook_url', webhookConfig.webhook_url)
        .single()
      
      if (registration && registration.external_webhook_id && registration.external_webhook_token) {
        // Delete the Discord webhook using Discord API
        const deleteResponse = await fetch(
          `https://discord.com/api/v10/webhooks/${registration.external_webhook_id}/${registration.external_webhook_token}`,
          { method: 'DELETE' }
        )
        
        if (deleteResponse.ok) {
          console.log('✅ Discord webhook deleted successfully')
        } else {
          console.warn('Failed to delete Discord webhook, but continuing cleanup')
        }
        
        // Remove from our webhook_registrations table
        await this.supabase
          .from('webhook_registrations')
          .delete()
          .eq('id', registration.id)
      }
    } catch (error) {
      console.error('Failed to unregister Discord webhook:', error)
      // Don't throw - continue with cleanup even if Discord API fails
    }
  }

  /**
   * Unregister Airtable webhook
   */
  private async unregisterAirtableWebhook(webhookConfig: any): Promise<void> {
    try {
      const baseId = webhookConfig.metadata?.baseId || webhookConfig.config?.baseId
      if (!baseId) return

      const { unregisterAirtableWebhook } = await import('@/lib/integrations/airtable/webhooks')
      await unregisterAirtableWebhook(webhookConfig.user_id, baseId)

      console.log('✅ Airtable webhook unregistered successfully')
    } catch (error) {
      console.error('Failed to unregister Airtable webhook:', error)
      // Don't throw - continue with cleanup even if Airtable API fails
    }
  }

  /**
   * Unregister webhook from external service
   */
  private async unregisterFromExternalService(webhookConfig: any): Promise<void> {
    // Implementation depends on the external service
    switch (webhookConfig.provider_id) {
      case 'discord':
        await this.unregisterDiscordWebhook(webhookConfig)
        break

      case 'airtable':
        await this.unregisterAirtableWebhook(webhookConfig)
        break

      default:
        console.log(`Unregistering webhook from ${webhookConfig.provider_id} not yet implemented`)
    }
  }

  /**
   * Validate webhook signature
   */
  private validateSignature(payload: any, headers: any, secret: string): boolean {
    // Implementation would depend on the service's signature method
    // For now, return true (implement proper validation for production)
    return true
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  /**
   * Log webhook execution
   */
  private async logWebhookExecution(webhookConfig: any, payload: any, headers: any): Promise<string> {
    const { data, error } = await this.supabase
      .from('webhook_executions')
      .insert({
        webhook_id: webhookConfig.id,
        workflow_id: webhookConfig.workflow_id,
        user_id: webhookConfig.user_id,
        trigger_type: webhookConfig.trigger_type,
        provider_id: webhookConfig.provider_id,
        payload: payload,
        headers: headers,
        status: 'success',
        execution_time_ms: 0
      })
      .select()
      .single()

    if (error) throw error
    return data.id
  }

  /**
   * Log webhook error
   */
  private async logWebhookError(webhookId: string, error: any): Promise<void> {
    await this.supabase
      .from('webhook_executions')
      .insert({
        webhook_id: webhookId,
        trigger_type: 'error',
        provider_id: 'system',
        payload: {},
        status: 'error',
        error_message: error.message
      })
  }

  /**
   * Execute workflow
   */
  private async executeWorkflow(workflowId: string, payload: any, executionId: string): Promise<void> {
    // This would trigger the workflow execution engine
    // For now, we'll make a call to the execution API
    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggerData: payload,
          executionId: executionId,
          source: 'webhook'
        })
      })

      if (!response.ok) {
        throw new Error(`Workflow execution failed: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Error executing workflow:', error)
      throw error
    }
  }

  /**
   * Get webhook URL for a workflow
   */
  getWebhookUrl(workflowId: string, providerId?: string): string {
    const baseUrl = getWebhookBaseUrl()
    if (providerId) {
      return `${baseUrl}/api/webhooks/${providerId}`
    }
    return `${baseUrl}/api/webhooks/${workflowId}`
  }

  /**
   * Get webhook configurations for a user
   */
  async getUserWebhooks(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('webhook_configs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  /**
   * Get webhook executions for a webhook
   */
  async getWebhookExecutions(webhookId: string, limit: number = 50): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('webhook_executions')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  }
} 
