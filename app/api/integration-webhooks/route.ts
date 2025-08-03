import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { detectAvailableIntegrations } from "@/lib/integrations/availableIntegrations"

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // First, try to query the integration_webhooks table
    const { data: existingWebhooks, error: tableError } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // If table exists and has data, return it
    if (!tableError && existingWebhooks && existingWebhooks.length > 0) {
      return NextResponse.json({ webhooks: existingWebhooks })
    }

    // If table doesn't exist or is empty, generate webhooks from available integrations
    const availableIntegrations = detectAvailableIntegrations()
    
    // Convert integrations to webhook format
    const webhooks = availableIntegrations.map((integration) => {
      // Generate appropriate webhook URL based on integration type
      const getWebhookUrl = (providerId: string) => {
        const webhookUrls: Record<string, string> = {
          gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/watch',
          'google-calendar': 'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
          'google-sheets': 'https://sheets.googleapis.com/v4/spreadsheets',
          'google-drive': 'https://www.googleapis.com/drive/v3/files/watch',
          'google-docs': 'https://docs.googleapis.com/v1/documents',
          slack: 'https://hooks.slack.com/services',
          discord: 'https://discord.com/api/webhooks',
          twitter: 'https://api.twitter.com/2/tweets/search/stream',
          facebook: 'https://graph.facebook.com/v18.0/me/subscribed_apps',
          instagram: 'https://graph.facebook.com/v18.0/me/media',
          tiktok: 'https://open.tiktokapis.com/v2/webhook',
          linkedin: 'https://api.linkedin.com/v2/organizationalEntityShareStatistics',
          github: 'https://api.github.com/webhooks',
          gitlab: 'https://gitlab.com/api/v4/projects',
          notion: 'https://api.notion.com/v1/webhooks',
          trello: 'https://api.trello.com/1/webhooks',
          hubspot: 'https://api.hubapi.com/webhooks/v1',
          airtable: 'https://api.airtable.com/v0',
          mailchimp: 'https://us1.api.mailchimp.com/3.0/lists',
          shopify: 'https://your-store.myshopify.com/admin/api/2023-10/webhooks.json',
          paypal: 'https://api-m.paypal.com/v1/notifications/webhooks',
          stripe: 'https://api.stripe.com/v1/webhook_endpoints',
          box: 'https://api.box.com/2.0/webhooks',
          dropbox: 'https://api.dropboxapi.com/2/files/list_folder/continue',
          teams: 'https://graph.microsoft.com/v1.0/subscriptions',
          onedrive: 'https://graph.microsoft.com/v1.0/subscriptions',
          'microsoft-outlook': 'https://graph.microsoft.com/v1.0/subscriptions',
          'microsoft-onenote': 'https://graph.microsoft.com/v1.0/subscriptions',
          youtube: 'https://www.googleapis.com/youtube/v3/search',
          'youtube-studio': 'https://www.googleapis.com/youtube/v3/channels',
          blackbaud: 'https://api.blackbaud.com/constituent/v1',
          gumroad: 'https://api.gumroad.com/v2/sales',
          manychat: 'https://api.manychat.com/webhook',
          beehiiv: 'https://api.beehiiv.com/v2/webhooks',
          kit: 'https://api.kit.co/webhooks',
          ai: 'https://api.chainreact.com/webhooks/ai',
          logic: 'https://api.chainreact.com/webhooks/logic'
        }
        
        return webhookUrls[providerId] || `https://api.chainreact.com/webhooks/${providerId}`
      }

      // Generate trigger types based on integration
      const getTriggerTypes = (providerId: string) => {
        const triggerTypes: Record<string, string[]> = {
          gmail: ['gmail_trigger_new_email', 'gmail_trigger_new_attachment', 'gmail_trigger_new_label'],
          'google-calendar': ['google_calendar_trigger_new_event', 'google_calendar_trigger_event_updated', 'google_calendar_trigger_event_canceled'],
          'google-sheets': ['google_sheets_trigger_new_row', 'google_sheets_trigger_new_worksheet', 'google_sheets_trigger_updated_row'],
          'google-drive': ['google_drive_trigger_new_file', 'google_drive_trigger_file_modified'],
          'google-docs': ['google_docs_trigger_document_modified'],
          slack: ['slack_trigger_new_message', 'slack_trigger_new_reaction', 'slack_trigger_slash_command'],
          discord: ['discord_trigger_new_message', 'discord_trigger_slash_command'],
          twitter: ['twitter_trigger_new_mention', 'twitter_trigger_new_follower', 'twitter_trigger_new_direct_message', 'twitter_trigger_search_match', 'twitter_trigger_user_tweet'],
          facebook: ['facebook_trigger_new_post', 'facebook_trigger_new_comment'],
          instagram: ['instagram_trigger_new_media', 'instagram_trigger_new_comment'],
          tiktok: ['tiktok_trigger_new_video', 'tiktok_trigger_new_comment'],
          linkedin: ['linkedin_trigger_new_post', 'linkedin_trigger_new_comment'],
          github: ['github_trigger_new_commit', 'github_trigger_new_issue', 'github_trigger_new_pull_request'],
          gitlab: ['gitlab_trigger_new_push', 'gitlab_trigger_new_issue', 'gitlab_trigger_new_merge_request'],
          notion: ['notion_trigger_new_page', 'notion_trigger_page_updated'],
          trello: ['trello_trigger_new_card', 'trello_trigger_card_moved'],
          hubspot: ['hubspot_trigger_new_contact', 'hubspot_trigger_contact_updated'],
          airtable: ['airtable_trigger_new_record', 'airtable_trigger_record_updated'],
          mailchimp: ['mailchimp_trigger_new_subscriber', 'mailchimp_trigger_email_opened'],
          shopify: ['shopify_trigger_new_order', 'shopify_trigger_order_updated'],
          paypal: ['paypal_trigger_new_payment', 'paypal_trigger_new_subscription'],
          stripe: ['stripe_trigger_new_payment', 'stripe_trigger_payment_succeeded', 'stripe_trigger_payment_failed'],
          box: ['box_trigger_new_file', 'box_trigger_new_comment'],
          dropbox: ['dropbox_trigger_new_file', 'dropbox_trigger_file_modified'],
          teams: ['teams_trigger_new_message', 'teams_trigger_user_joins_team'],
          onedrive: ['onedrive_trigger_new_file', 'onedrive_trigger_file_modified'],
          'microsoft-outlook': ['microsoft-outlook_trigger_new_email', 'microsoft-outlook_trigger_email_sent'],
          'microsoft-onenote': ['microsoft-onenote_trigger_new_note', 'microsoft-onenote_trigger_note_modified'],
          youtube: ['youtube_trigger_new_video', 'youtube_trigger_new_comment'],
          'youtube-studio': ['youtube-studio_trigger_new_comment', 'youtube-studio_trigger_channel_analytics'],
          blackbaud: ['blackbaud_trigger_new_donor', 'blackbaud_trigger_new_donation'],
          gumroad: ['gumroad_trigger_new_sale', 'gumroad_trigger_new_subscriber'],
          manychat: ['manychat_trigger_new_subscriber', 'manychat_trigger_message_received'],
          beehiiv: ['beehiiv_trigger_new_subscriber', 'beehiiv_trigger_post_published'],
          kit: ['kit_trigger_new_subscriber', 'kit_trigger_tag_added'],
          ai: ['ai_trigger_goal_completed', 'ai_trigger_tool_called'],
          logic: ['logic_trigger_condition_met', 'logic_trigger_timer_expired']
        }
        
        return triggerTypes[providerId] || [`${providerId}_trigger_default`]
      }

      // Generate setup instructions
      const getSetupInstructions = (providerId: string) => {
        const instructions: Record<string, string> = {
          gmail: 'Set up Gmail API push notifications in Google Cloud Console',
          'google-calendar': 'Set up Google Calendar API push notifications',
          'google-sheets': 'Set up Google Sheets API webhooks',
          'google-drive': 'Set up Google Drive API webhooks',
          'google-docs': 'Set up Google Docs API webhooks',
          slack: 'Create a Slack app and configure Event Subscriptions',
          discord: 'Create Discord webhooks for your server',
          twitter: 'Set up Twitter API v2 webhooks',
          facebook: 'Set up Facebook Graph API webhooks',
          instagram: 'Set up Instagram Basic Display API webhooks',
          tiktok: 'Set up TikTok for Developers webhooks',
          linkedin: 'Set up LinkedIn Marketing API webhooks',
          github: 'Add webhook URL to your GitHub repository settings',
          gitlab: 'Add webhook URL to your GitLab project settings',
          notion: 'Create a Notion integration and add webhook URL',
          trello: 'Create Trello webhooks for your boards',
          hubspot: 'Configure HubSpot webhooks in your account',
          airtable: 'Set up Airtable webhooks for your base',
          mailchimp: 'Set up Mailchimp webhooks in your account',
          shopify: 'Create webhook in Shopify Admin',
          paypal: 'Create webhook in PayPal Developer Dashboard',
          stripe: 'Create webhook endpoint in Stripe Dashboard',
          box: 'Create Box webhooks in your app',
          dropbox: 'Set up Dropbox webhooks in your app',
          teams: 'Set up Microsoft Graph webhooks for Teams',
          onedrive: 'Set up Microsoft Graph webhooks for OneDrive',
          'microsoft-outlook': 'Set up Microsoft Graph webhooks for Outlook',
          'microsoft-onenote': 'Set up Microsoft Graph webhooks for OneNote',
          youtube: 'Set up YouTube Data API webhooks',
          'youtube-studio': 'Set up YouTube Studio API webhooks',
          blackbaud: 'Set up Blackbaud RENXT webhooks',
          gumroad: 'Set up Gumroad webhooks in your account',
          manychat: 'Set up ManyChat webhooks in your account',
          beehiiv: 'Set up Beehiiv webhooks in your account',
          kit: 'Set up Kit webhooks in your account',
          ai: 'AI Agent webhooks are automatically configured',
          logic: 'Logic webhooks are automatically configured'
        }
        
        return instructions[providerId] || `Set up ${integration.name} webhooks in your account`
      }

      return {
        id: `${integration.id}-webhook`,
        user_id: user.id,
        provider_id: integration.id,
        webhook_url: getWebhookUrl(integration.id),
        trigger_types: getTriggerTypes(integration.id),
        integration_config: {},
        external_config: {
          type: integration.id,
          setup_required: integration.authType === 'oauth' || integration.authType === 'apiKey',
          instructions: getSetupInstructions(integration.id),
          integration_name: integration.name,
          category: integration.category,
          capabilities: integration.capabilities
        },
        status: integration.isAvailable ? 'active' : 'inactive',
        last_triggered: null,
        trigger_count: 0,
        error_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    })

    return NextResponse.json({ webhooks })

  } catch (error: any) {
    console.error("Error in GET /api/integration-webhooks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 