import { createClient } from '@supabase/supabase-js'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

interface IntegrationWebhookConfig {
  providerId: string
  triggerTypes: string[]
  webhookUrl: string
  userId: string
  integrationConfig: Record<string, any>
}

export class IntegrationWebhookService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /**
   * Set up webhooks for all supported integrations when a user connects an account
   */
  async setupIntegrationWebhooks(userId: string, providerId: string, integrationConfig: Record<string, any>): Promise<void> {
    try {
      console.log(`Setting up webhooks for ${providerId} integration for user ${userId}`)

      const webhookConfigs = this.getWebhookConfigsForProvider(providerId, userId, integrationConfig)
      
      for (const config of webhookConfigs) {
        await this.registerIntegrationWebhook(config)
      }

      console.log(`Successfully set up ${webhookConfigs.length} webhooks for ${providerId}`)
    } catch (error) {
      console.error(`Error setting up webhooks for ${providerId}:`, error)
      throw error
    }
  }

  /**
   * Get webhook configurations for a specific provider
   */
  private getWebhookConfigsForProvider(providerId: string, userId: string, integrationConfig: Record<string, any>): IntegrationWebhookConfig[] {
    const baseUrl = getWebhookBaseUrl()
    
    // Get all trigger types for this provider from the available nodes
    const triggerTypes = this.getTriggerTypesForProvider(providerId)
    
    if (triggerTypes.length === 0) {
      console.log(`No webhook triggers found for provider: ${providerId}`)
      return []
    }

    return [{
      providerId,
      triggerTypes,
      webhookUrl: `${baseUrl}/api/workflow/${providerId}`,
      userId,
      integrationConfig
    }]
  }

  /**
   * Get all trigger types for a specific provider
   */
  private getTriggerTypesForProvider(providerId: string): string[] {
    // This would ideally come from the availableNodes.ts file
    // For now, we'll define the trigger types for each provider
    const providerTriggers: Record<string, string[]> = {
      // Google Services
      'gmail': ['gmail_trigger_new_email', 'gmail_trigger_new_attachment', 'gmail_trigger_new_label'],
      'google-calendar': ['google_calendar_trigger_new_event', 'google_calendar_trigger_event_updated', 'google_calendar_trigger_event_canceled'],
      'google-drive': ['google-drive:new_file_in_folder', 'google-drive:new_folder_in_folder', 'google-drive:file_updated'],
      'google-sheets': ['google_sheets_trigger_new_row', 'google_sheets_trigger_new_worksheet', 'google_sheets_trigger_updated_row'],
      'google-docs': ['google_docs_trigger_new_document', 'google_docs_trigger_document_updated'],
      'youtube': ['youtube_trigger_new_video', 'youtube_trigger_new_comment', 'youtube_trigger_channel_update'],
      'youtube-studio': ['youtube_studio_trigger_analytics_update', 'youtube_studio_trigger_content_id'],

      // Microsoft Services
      'teams': ['teams_trigger_new_message', 'teams_trigger_channel_created', 'teams_trigger_user_joined'],
      'onedrive': ['onedrive_trigger_new_file', 'onedrive_trigger_file_updated', 'onedrive_trigger_folder_created'],

      // Communication Platforms
      'slack': ['slack_trigger_new_message', 'slack_trigger_channel_created', 'slack_trigger_user_joined'],
      'discord': ['discord_trigger_new_message', 'discord_trigger_member_join', 'discord_trigger_slash_command', 'discord_trigger_reaction_added'],

      // Social Media
      'twitter': ['twitter_trigger_new_tweet', 'twitter_trigger_mention', 'twitter_trigger_direct_message'],
      'facebook': ['facebook_trigger_new_post', 'facebook_trigger_page_update', 'facebook_trigger_message'],
      'instagram': ['instagram_trigger_new_post', 'instagram_trigger_story', 'instagram_trigger_comment'],
      'tiktok': ['tiktok_trigger_new_video', 'tiktok_trigger_comment', 'tiktok_trigger_follow'],
      'linkedin': ['linkedin_trigger_new_post', 'linkedin_trigger_company_update', 'linkedin_trigger_message'],

      // Development & Productivity
      'github': ['github_trigger_new_issue', 'github_trigger_issue_updated', 'github_trigger_new_pr', 'github_trigger_pr_updated'],
      'gitlab': ['gitlab_trigger_new_issue', 'gitlab_trigger_merge_request', 'gitlab_trigger_pipeline'],
      'notion': ['notion_trigger_new_page', 'notion_trigger_page_updated', 'notion_trigger_database_update'],
      'trello': ['trello_trigger_new_card', 'trello_trigger_card_moved', 'trello_trigger_board_update'],

      // Business & CRM
      'hubspot': ['hubspot_trigger_new_contact', 'hubspot_trigger_contact_updated', 'hubspot_trigger_new_deal'],
      'airtable': ['airtable_trigger_new_record', 'airtable_trigger_record_updated', 'airtable_trigger_base_update'],
      'mailchimp': ['mailchimp_trigger_new_subscriber', 'mailchimp_trigger_campaign_sent', 'mailchimp_trigger_email_opened'],

      // E-commerce & Payments
      'shopify': ['shopify_trigger_new_order', 'shopify_trigger_order_updated', 'shopify_trigger_new_product'],
      'paypal': ['paypal_trigger_payment_received', 'paypal_trigger_invoice_paid', 'paypal_trigger_subscription_created'],
      'stripe': ['stripe_trigger_payment_intent_succeeded', 'stripe_trigger_invoice_payment_succeeded', 'stripe_trigger_customer_created'],

      // Cloud Storage
      'box': ['box_trigger_new_file', 'box_trigger_file_updated', 'box_trigger_folder_created'],
      'dropbox': ['dropbox_trigger_new_file', 'dropbox_trigger_file_updated', 'dropbox_trigger_folder_created'],

      // Other Integrations
      'blackbaud': ['blackbaud_trigger_new_donor', 'blackbaud_trigger_donation_received', 'blackbaud_trigger_grant_updated'],
      'gumroad': ['gumroad_trigger_new_sale', 'gumroad_trigger_product_updated', 'gumroad_trigger_customer_created'],
      'manychat': ['manychat_trigger_new_subscriber', 'manychat_trigger_message_received', 'manychat_trigger_automation_triggered']
    }

    return providerTriggers[providerId] || []
  }

  /**
   * Register a webhook with the external service
   */
  private async registerIntegrationWebhook(config: IntegrationWebhookConfig): Promise<void> {
    try {
      // Store webhook configuration in database
      const { data: webhookConfig, error } = await this.supabase
        .from('integration_webhooks')
        .insert({
          user_id: config.userId,
          provider_id: config.providerId,
          webhook_url: config.webhookUrl,
          trigger_types: config.triggerTypes,
          integration_config: config.integrationConfig,
          status: 'active'
        })
        .select()
        .single()

      if (error) throw error

      // Register with external service based on provider
      await this.registerWithExternalService(config, webhookConfig.id)

      console.log(`Registered webhook for ${config.providerId} with ID: ${webhookConfig.id}`)
    } catch (error) {
      console.error(`Error registering webhook for ${config.providerId}:`, error)
      throw error
    }
  }

  /**
   * Register webhook with external service
   */
  private async registerWithExternalService(config: IntegrationWebhookConfig, webhookId: string): Promise<void> {
    const integrationConfig = INTEGRATION_CONFIGS[config.providerId]
    
    if (!integrationConfig) {
      console.log(`No integration config found for ${config.providerId}`)
      return
    }

    // Store setup instructions for manual configuration
    const setupInstructions = this.getSetupInstructions(config.providerId)
    
    await this.supabase
      .from('integration_webhooks')
      .update({
        external_config: {
          type: config.providerId,
          setup_required: true,
          instructions: setupInstructions,
          integration_name: integrationConfig.name,
          category: integrationConfig.category,
          capabilities: integrationConfig.capabilities
        }
      })
      .eq('id', webhookId)

    console.log(`Webhook registration for ${config.providerId} requires manual setup`)
  }

  /**
   * Get setup instructions for each integration
   */
  private getSetupInstructions(providerId: string): string {
    const instructions: Record<string, string> = {
      // Google Services
      'gmail': 'Set up Google Cloud Pub/Sub topic and subscription for Gmail push notifications',
      'google-calendar': 'Configure Google Calendar webhook through Google Cloud Console',
      'google-drive': 'Set up Google Drive webhook through Google Cloud Console',
      'google-sheets': 'Configure Google Sheets webhook through Google Cloud Console',
      'google-docs': 'Set up Google Docs webhook through Google Cloud Console',
      'youtube': 'Configure YouTube webhook through Google Cloud Console',
      'youtube-studio': 'Set up YouTube Studio webhook through Google Cloud Console',

      // Microsoft Services
      'teams': 'Configure webhook URL in Microsoft Teams app settings',
      'onedrive': 'Set up OneDrive webhook through Microsoft Graph API',

      // Communication Platforms
      'slack': 'Configure webhook URL in Slack app settings',
      'discord': 'Set up webhook URL in Discord bot settings',

      // Social Media
      'twitter': 'Configure webhook URL in Twitter Developer Portal',
      'facebook': 'Set up webhook URL in Facebook App settings',
      'instagram': 'Configure webhook URL in Instagram Basic Display API',
      'tiktok': 'Set up webhook URL in TikTok Developer Portal',
      'linkedin': 'Configure webhook URL in LinkedIn Developer Portal',

      // Development & Productivity
      'github': 'Add webhook URL to repository webhook settings',
      'gitlab': 'Configure webhook URL in GitLab project settings',
      'notion': 'Set up webhook through Notion API',
      'trello': 'Configure webhook URL in Trello Power-Up settings',

      // Business & CRM
      'hubspot': 'Configure webhook in HubSpot settings',
      'airtable': 'Set up webhook through Airtable API',
      'mailchimp': 'Configure webhook URL in Mailchimp settings',

      // E-commerce & Payments
      'shopify': 'Set up webhook URL in Shopify app settings',
      'paypal': 'Configure webhook URL in PayPal Developer Portal',
      'stripe': 'Set up webhook URL in Stripe Dashboard',

      // Cloud Storage
      'box': 'Configure webhook URL in Box Developer Console',
      'dropbox': 'Set up webhook URL in Dropbox Developer Portal',

      // Other Integrations
      'blackbaud': 'Configure webhook URL in Blackbaud Developer Portal',
      'gumroad': 'Set up webhook URL in Gumroad API settings',
      'manychat': 'Configure webhook URL in ManyChat settings'
    }

    return instructions[providerId] || `Set up webhook URL for ${providerId} integration`
  }

  /**
   * Remove webhooks when user disconnects an integration
   */
  async removeIntegrationWebhooks(userId: string, providerId: string): Promise<void> {
    try {
      console.log(`Removing webhooks for ${providerId} integration for user ${userId}`)

      // Get all webhooks for this user and provider
      const { data: webhooks, error } = await this.supabase
        .from('integration_webhooks')
        .select('*')
        .eq('user_id', userId)
        .eq('provider_id', providerId)

      if (error) throw error

      // Remove from external services and database
      for (const webhook of webhooks || []) {
        await this.removeFromExternalService(webhook)
        
        await this.supabase
          .from('integration_webhooks')
          .delete()
          .eq('id', webhook.id)
      }

      console.log(`Successfully removed ${webhooks?.length || 0} webhooks for ${providerId}`)
    } catch (error) {
      console.error(`Error removing webhooks for ${providerId}:`, error)
      throw error
    }
  }

  /**
   * Remove webhook from external service
   */
  private async removeFromExternalService(webhook: any): Promise<void> {
    // Implementation would depend on the external service
    console.log(`Removing webhook from ${webhook.provider_id}`)
  }

  /**
   * Get webhook status for a user's integrations
   */
  async getUserIntegrationWebhooks(userId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('integration_webhooks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  /**
   * Get all supported integrations for webhooks
   */
  getSupportedIntegrations(): string[] {
    return Object.keys(INTEGRATION_CONFIGS)
  }

  /**
   * Check if an integration supports webhooks
   */
  supportsWebhooks(providerId: string): boolean {
    const triggerTypes = this.getTriggerTypesForProvider(providerId)
    return triggerTypes.length > 0
  }
} 