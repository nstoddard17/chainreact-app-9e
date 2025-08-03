"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { 
  Webhook, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Activity,
  Settings,
  Eye,
  BookOpen,
  Link,
  Zap
} from 'lucide-react'

interface IntegrationWebhook {
  id: string
  user_id: string
  provider_id: string
  webhook_url: string
  trigger_types: string[]
  integration_config: Record<string, any>
  external_config: {
    type: string
    setup_required: boolean
    instructions: string
    integration_name: string
    category: string
    capabilities: string[]
  }
  status: 'active' | 'inactive' | 'error'
  last_triggered: string | null
  trigger_count: number
  error_count: number
  created_at: string
  updated_at: string
}

interface WebhookExecution {
  id: string
  webhook_id: string
  user_id: string
  provider_id: string
  trigger_type: string
  payload: any
  headers: any
  status: 'success' | 'error' | 'pending'
  response_code: number | null
  response_body: string | null
  error_message: string | null
  execution_time_ms: number
  triggered_at: string
}

export default function IntegrationWebhookManager() {
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([])
  const [executions, setExecutions] = useState<WebhookExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWebhook, setSelectedWebhook] = useState<IntegrationWebhook | null>(null)
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null)
  const { toast } = useToast()

  // Helper function to create properly typed fallback webhooks
  const createFallbackWebhooks = (): IntegrationWebhook[] => [
    {
      id: 'gmail-sample',
      user_id: 'sample',
      provider_id: 'gmail',
      webhook_url: 'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      trigger_types: ['gmail_trigger_new_email', 'gmail_trigger_new_attachment', 'gmail_trigger_new_label'],
      integration_config: {},
      external_config: {
        type: 'gmail',
        setup_required: true,
        instructions: 'Set up Gmail API push notifications in Google Cloud Console',
        integration_name: 'Gmail',
        category: 'Communication',
        capabilities: ['email', 'automation']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'slack-sample',
      user_id: 'sample',
      provider_id: 'slack',
      webhook_url: 'https://hooks.slack.com/services',
      trigger_types: ['slack_trigger_new_message', 'slack_trigger_new_reaction', 'slack_trigger_slash_command'],
      integration_config: {},
      external_config: {
        type: 'slack',
        setup_required: true,
        instructions: 'Create a Slack app and configure Event Subscriptions',
        integration_name: 'Slack',
        category: 'Communication',
        capabilities: ['messaging', 'notifications']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'google-calendar-sample',
      user_id: 'sample',
      provider_id: 'google-calendar',
      webhook_url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
      trigger_types: ['google_calendar_trigger_new_event', 'google_calendar_trigger_event_updated', 'google_calendar_trigger_event_canceled'],
      integration_config: {},
      external_config: {
        type: 'google-calendar',
        setup_required: true,
        instructions: 'Set up Google Calendar API push notifications',
        integration_name: 'Google Calendar',
        category: 'Productivity',
        capabilities: ['calendar', 'scheduling']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'google-sheets-sample',
      user_id: 'sample',
      provider_id: 'google-sheets',
      webhook_url: 'https://sheets.googleapis.com/v4/spreadsheets',
      trigger_types: ['google_sheets_trigger_new_row', 'google_sheets_trigger_new_worksheet', 'google_sheets_trigger_updated_row'],
      integration_config: {},
      external_config: {
        type: 'google-sheets',
        setup_required: true,
        instructions: 'Set up Google Sheets API webhooks',
        integration_name: 'Google Sheets',
        category: 'Productivity',
        capabilities: ['spreadsheets', 'data']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'google-drive-sample',
      user_id: 'sample',
      provider_id: 'google-drive',
      webhook_url: 'https://www.googleapis.com/drive/v3/files/watch',
      trigger_types: ['google_drive_trigger_new_file', 'google_drive_trigger_file_modified'],
      integration_config: {},
      external_config: {
        type: 'google-drive',
        setup_required: true,
        instructions: 'Set up Google Drive API webhooks',
        integration_name: 'Google Drive',
        category: 'Storage',
        capabilities: ['file_storage', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'google-docs-sample',
      user_id: 'sample',
      provider_id: 'google-docs',
      webhook_url: 'https://docs.googleapis.com/v1/documents',
      trigger_types: ['google_docs_trigger_document_modified'],
      integration_config: {},
      external_config: {
        type: 'google-docs',
        setup_required: true,
        instructions: 'Set up Google Docs API webhooks',
        integration_name: 'Google Docs',
        category: 'Productivity',
        capabilities: ['documentation', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'notion-sample',
      user_id: 'sample',
      provider_id: 'notion',
      webhook_url: 'https://api.notion.com/v1/webhooks',
      trigger_types: ['notion_trigger_new_page'],
      integration_config: {},
      external_config: {
        type: 'notion',
        setup_required: true,
        instructions: 'Create a Notion integration and add webhook URL',
        integration_name: 'Notion',
        category: 'Productivity',
        capabilities: ['documentation', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'github-sample',
      user_id: 'sample',
      provider_id: 'github',
      webhook_url: 'https://api.github.com/webhooks',
      trigger_types: ['github_trigger_new_commit'],
      integration_config: {},
      external_config: {
        type: 'github',
        setup_required: true,
        instructions: 'Add webhook URL to your GitHub repository settings',
        integration_name: 'GitHub',
        category: 'Development',
        capabilities: ['code', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'gitlab-sample',
      user_id: 'sample',
      provider_id: 'gitlab',
      webhook_url: 'https://gitlab.com/api/v4/projects',
      trigger_types: ['gitlab_trigger_new_push', 'gitlab_trigger_new_issue'],
      integration_config: {},
      external_config: {
        type: 'gitlab',
        setup_required: true,
        instructions: 'Add webhook URL to your GitLab project settings',
        integration_name: 'GitLab',
        category: 'Development',
        capabilities: ['code', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'stripe-sample',
      user_id: 'sample',
      provider_id: 'stripe',
      webhook_url: 'https://api.stripe.com/v1/webhook_endpoints',
      trigger_types: ['stripe_trigger_new_payment'],
      integration_config: {},
      external_config: {
        type: 'stripe',
        setup_required: true,
        instructions: 'Create webhook endpoint in Stripe Dashboard',
        integration_name: 'Stripe',
        category: 'eCommerce',
        capabilities: ['payments', 'billing']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'hubspot-sample',
      user_id: 'sample',
      provider_id: 'hubspot',
      webhook_url: 'https://api.hubapi.com/webhooks/v1',
      trigger_types: ['hubspot_trigger_new_contact'],
      integration_config: {},
      external_config: {
        type: 'hubspot',
        setup_required: true,
        instructions: 'Configure HubSpot webhooks in your account',
        integration_name: 'HubSpot',
        category: 'CRM',
        capabilities: ['sales', 'marketing']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'airtable-sample',
      user_id: 'sample',
      provider_id: 'airtable',
      webhook_url: 'https://api.airtable.com/v0',
      trigger_types: ['airtable_trigger_new_record'],
      integration_config: {},
      external_config: {
        type: 'airtable',
        setup_required: true,
        instructions: 'Set up Airtable webhooks for your base',
        integration_name: 'Airtable',
        category: 'Database',
        capabilities: ['data', 'automation']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'discord-sample',
      user_id: 'sample',
      provider_id: 'discord',
      webhook_url: 'https://discord.com/api/webhooks',
      trigger_types: ['discord_trigger_new_message', 'discord_trigger_slash_command'],
      integration_config: {},
      external_config: {
        type: 'discord',
        setup_required: true,
        instructions: 'Create Discord webhooks for your server',
        integration_name: 'Discord',
        category: 'Communication',
        capabilities: ['messaging', 'community']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'teams-sample',
      user_id: 'sample',
      provider_id: 'teams',
      webhook_url: 'https://graph.microsoft.com/v1.0/subscriptions',
      trigger_types: ['teams_trigger_new_message', 'teams_trigger_user_joins_team'],
      integration_config: {},
      external_config: {
        type: 'teams',
        setup_required: true,
        instructions: 'Set up Microsoft Graph webhooks for Teams',
        integration_name: 'Microsoft Teams',
        category: 'Communication',
        capabilities: ['messaging', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'onedrive-sample',
      user_id: 'sample',
      provider_id: 'onedrive',
      webhook_url: 'https://graph.microsoft.com/v1.0/subscriptions',
      trigger_types: ['onedrive_trigger_new_file', 'onedrive_trigger_file_modified'],
      integration_config: {},
      external_config: {
        type: 'onedrive',
        setup_required: true,
        instructions: 'Set up Microsoft Graph webhooks for OneDrive',
        integration_name: 'OneDrive',
        category: 'Storage',
        capabilities: ['file_storage', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'microsoft-outlook-sample',
      user_id: 'sample',
      provider_id: 'microsoft-outlook',
      webhook_url: 'https://graph.microsoft.com/v1.0/subscriptions',
      trigger_types: ['microsoft-outlook_trigger_new_email', 'microsoft-outlook_trigger_email_sent'],
      integration_config: {},
      external_config: {
        type: 'microsoft-outlook',
        setup_required: true,
        instructions: 'Set up Microsoft Graph webhooks for Outlook',
        integration_name: 'Microsoft Outlook',
        category: 'Communication',
        capabilities: ['email', 'calendar']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'microsoft-onenote-sample',
      user_id: 'sample',
      provider_id: 'microsoft-onenote',
      webhook_url: 'https://graph.microsoft.com/v1.0/subscriptions',
      trigger_types: ['microsoft-onenote_trigger_new_note', 'microsoft-onenote_trigger_note_modified'],
      integration_config: {},
      external_config: {
        type: 'microsoft-onenote',
        setup_required: true,
        instructions: 'Set up Microsoft Graph webhooks for OneNote',
        integration_name: 'Microsoft OneNote',
        category: 'Productivity',
        capabilities: ['notes', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'twitter-sample',
      user_id: 'sample',
      provider_id: 'twitter',
      webhook_url: 'https://api.twitter.com/2/tweets/search/stream',
      trigger_types: ['twitter_trigger_new_mention', 'twitter_trigger_new_follower', 'twitter_trigger_new_direct_message', 'twitter_trigger_search_match', 'twitter_trigger_user_tweet'],
      integration_config: {},
      external_config: {
        type: 'twitter',
        setup_required: true,
        instructions: 'Set up Twitter API v2 webhooks',
        integration_name: 'Twitter (X)',
        category: 'Social',
        capabilities: ['social', 'engagement']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'trello-sample',
      user_id: 'sample',
      provider_id: 'trello',
      webhook_url: 'https://api.trello.com/1/webhooks',
      trigger_types: ['trello_trigger_new_card'],
      integration_config: {},
      external_config: {
        type: 'trello',
        setup_required: true,
        instructions: 'Create Trello webhooks for your boards',
        integration_name: 'Trello',
        category: 'Project Management',
        capabilities: ['task_management', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'dropbox-sample',
      user_id: 'sample',
      provider_id: 'dropbox',
      webhook_url: 'https://api.dropboxapi.com/2/files/list_folder/continue',
      trigger_types: ['dropbox_trigger_new_file'],
      integration_config: {},
      external_config: {
        type: 'dropbox',
        setup_required: true,
        instructions: 'Set up Dropbox webhooks in your app',
        integration_name: 'Dropbox',
        category: 'Storage',
        capabilities: ['file_storage', 'sync']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'youtube-sample',
      user_id: 'sample',
      provider_id: 'youtube',
      webhook_url: 'https://www.googleapis.com/youtube/v3/search',
      trigger_types: ['youtube_trigger_new_video', 'youtube_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'youtube',
        setup_required: true,
        instructions: 'Set up YouTube Data API webhooks',
        integration_name: 'YouTube',
        category: 'Social',
        capabilities: ['video', 'social']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'youtube-studio-sample',
      user_id: 'sample',
      provider_id: 'youtube-studio',
      webhook_url: 'https://www.googleapis.com/youtube/v3/channels',
      trigger_types: ['youtube-studio_trigger_new_comment', 'youtube-studio_trigger_channel_analytics'],
      integration_config: {},
      external_config: {
        type: 'youtube-studio',
        setup_required: true,
        instructions: 'Set up YouTube Studio API webhooks',
        integration_name: 'YouTube Studio',
        category: 'Social',
        capabilities: ['video', 'analytics']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'shopify-sample',
      user_id: 'sample',
      provider_id: 'shopify',
      webhook_url: 'https://your-store.myshopify.com/admin/api/2023-10/webhooks.json',
      trigger_types: ['shopify_trigger_new_order'],
      integration_config: {},
      external_config: {
        type: 'shopify',
        setup_required: true,
        instructions: 'Create webhook in Shopify Admin',
        integration_name: 'Shopify',
        category: 'eCommerce',
        capabilities: ['ecommerce', 'orders']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'facebook-sample',
      user_id: 'sample',
      provider_id: 'facebook',
      webhook_url: 'https://graph.facebook.com/v18.0/me/subscribed_apps',
      trigger_types: ['facebook_trigger_new_post', 'facebook_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'facebook',
        setup_required: true,
        instructions: 'Set up Facebook Graph API webhooks',
        integration_name: 'Facebook',
        category: 'Social',
        capabilities: ['social', 'engagement']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'instagram-sample',
      user_id: 'sample',
      provider_id: 'instagram',
      webhook_url: 'https://graph.facebook.com/v18.0/me/media',
      trigger_types: ['instagram_trigger_new_media', 'instagram_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'instagram',
        setup_required: true,
        instructions: 'Set up Instagram Basic Display API webhooks',
        integration_name: 'Instagram',
        category: 'Social',
        capabilities: ['social', 'media']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'linkedin-sample',
      user_id: 'sample',
      provider_id: 'linkedin',
      webhook_url: 'https://api.linkedin.com/v2/organizationalEntityShareStatistics',
      trigger_types: ['linkedin_trigger_new_post', 'linkedin_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'linkedin',
        setup_required: true,
        instructions: 'Set up LinkedIn Marketing API webhooks',
        integration_name: 'LinkedIn',
        category: 'Social',
        capabilities: ['social', 'professional']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'mailchimp-sample',
      user_id: 'sample',
      provider_id: 'mailchimp',
      webhook_url: 'https://us1.api.mailchimp.com/3.0/lists',
      trigger_types: ['mailchimp_trigger_new_subscriber', 'mailchimp_trigger_email_opened'],
      integration_config: {},
      external_config: {
        type: 'mailchimp',
        setup_required: true,
        instructions: 'Set up Mailchimp webhooks in your account',
        integration_name: 'Mailchimp',
        category: 'Marketing',
        capabilities: ['email', 'marketing']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'paypal-sample',
      user_id: 'sample',
      provider_id: 'paypal',
      webhook_url: 'https://api-m.paypal.com/v1/notifications/webhooks',
      trigger_types: ['paypal_trigger_new_payment', 'paypal_trigger_new_subscription'],
      integration_config: {},
      external_config: {
        type: 'paypal',
        setup_required: true,
        instructions: 'Create webhook in PayPal Developer Dashboard',
        integration_name: 'PayPal',
        category: 'eCommerce',
        capabilities: ['payments', 'subscriptions']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'box-sample',
      user_id: 'sample',
      provider_id: 'box',
      webhook_url: 'https://api.box.com/2.0/webhooks',
      trigger_types: ['box_trigger_new_file', 'box_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'box',
        setup_required: true,
        instructions: 'Create Box webhooks in your app',
        integration_name: 'Box',
        category: 'Storage',
        capabilities: ['file_storage', 'collaboration']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'tiktok-sample',
      user_id: 'sample',
      provider_id: 'tiktok',
      webhook_url: 'https://open.tiktokapis.com/v2/webhook',
      trigger_types: ['tiktok_trigger_new_video', 'tiktok_trigger_new_comment'],
      integration_config: {},
      external_config: {
        type: 'tiktok',
        setup_required: true,
        instructions: 'Set up TikTok for Developers webhooks',
        integration_name: 'TikTok',
        category: 'Social',
        capabilities: ['video', 'social']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'blackbaud-sample',
      user_id: 'sample',
      provider_id: 'blackbaud',
      webhook_url: 'https://api.blackbaud.com/constituent/v1',
      trigger_types: ['blackbaud_trigger_new_donor', 'blackbaud_trigger_new_donation'],
      integration_config: {},
      external_config: {
        type: 'blackbaud',
        setup_required: true,
        instructions: 'Set up Blackbaud RENXT webhooks',
        integration_name: 'Blackbaud',
        category: 'Nonprofit',
        capabilities: ['donor_management', 'fundraising']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'gumroad-sample',
      user_id: 'sample',
      provider_id: 'gumroad',
      webhook_url: 'https://api.gumroad.com/v2/sales',
      trigger_types: ['gumroad_trigger_new_sale', 'gumroad_trigger_new_subscriber'],
      integration_config: {},
      external_config: {
        type: 'gumroad',
        setup_required: true,
        instructions: 'Set up Gumroad webhooks in your account',
        integration_name: 'Gumroad',
        category: 'eCommerce',
        capabilities: ['digital_products', 'subscriptions']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'beehiiv-sample',
      user_id: 'sample',
      provider_id: 'beehiiv',
      webhook_url: 'https://api.beehiiv.com/v2/webhooks',
      trigger_types: ['beehiiv_trigger_new_subscriber'],
      integration_config: {},
      external_config: {
        type: 'beehiiv',
        setup_required: true,
        instructions: 'Set up Beehiiv webhooks in your account',
        integration_name: 'Beehiiv',
        category: 'Newsletter',
        capabilities: ['newsletter', 'subscribers']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'manychat-sample',
      user_id: 'sample',
      provider_id: 'manychat',
      webhook_url: 'https://api.manychat.com/webhook',
      trigger_types: ['manychat_trigger_new_subscriber'],
      integration_config: {},
      external_config: {
        type: 'manychat',
        setup_required: true,
        instructions: 'Set up ManyChat webhooks in your account',
        integration_name: 'ManyChat',
        category: 'Marketing',
        capabilities: ['chatbot', 'automation']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'kit-sample',
      user_id: 'sample',
      provider_id: 'kit',
      webhook_url: 'https://api.kit.co/webhooks',
      trigger_types: ['kit_trigger_new_subscriber', 'kit_trigger_tag_added'],
      integration_config: {},
      external_config: {
        type: 'kit',
        setup_required: true,
        instructions: 'Set up Kit webhooks in your account',
        integration_name: 'Kit',
        category: 'Marketing',
        capabilities: ['marketing', 'automation']
      },
      status: 'active' as const,
      last_triggered: null,
      trigger_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]

  useEffect(() => {
    fetchIntegrationWebhooks()
  }, [])

  const fetchIntegrationWebhooks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/integration-webhooks')
      
      if (response.ok) {
        const data = await response.json()
        const webhooks = data.webhooks || []
        setWebhooks(webhooks)
      } else {
        console.error('Failed to fetch integration webhooks, using fallback data')
        // Use fallback sample data when API fails
        setWebhooks(createFallbackWebhooks())
      }
    } catch (error) {
      console.error('Error fetching integration webhooks:', error)
      // Use fallback data on any error
      setWebhooks(createFallbackWebhooks())
    } finally {
      setLoading(false)
    }
  }

  const fetchWebhookExecutions = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/integration-webhooks/executions/${webhookId}`)
      
      if (response.ok) {
        const data = await response.json()
        setExecutions(data.executions || [])
      }
    } catch (error) {
      console.error('Error fetching webhook executions:', error)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedWebhookId(label)
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
        variant: "default"
      })
      setTimeout(() => setCopiedWebhookId(null), 2000)
    } catch (error) {
      console.error('Error copying to clipboard:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>
      case 'inactive':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Inactive</Badge>
      case 'error':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getProviderIcon = (providerId: string) => {
    // You can add provider-specific icons here
    return <Webhook className="w-4 h-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading integration webhooks...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integration Webhooks</h1>
          <p className="text-muted-foreground">
            Webhook URLs and setup instructions for your connected integrations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchIntegrationWebhooks} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{webhooks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {webhooks.filter(w => w.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Triggers</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {webhooks.reduce((sum, w) => sum + (w.trigger_types?.length || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Setup Required</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {webhooks.filter(w => w.external_config?.setup_required).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhooks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Webhook URLs</CardTitle>
          <CardDescription>
            Copy these URLs to your integration developer portals
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No integration webhooks yet</h3>
              <p className="text-muted-foreground mb-4">
                Connect integrations to automatically generate webhook URLs.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Integration</TableHead>
                  <TableHead>Webhook URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getProviderIcon(webhook.provider_id)}
                        <div>
                          <div className="font-medium">
                            {webhook.external_config?.integration_name || webhook.provider_id}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {webhook.external_config?.category || 'Integration'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div 
                        className="max-w-md break-all text-sm font-mono cursor-help" 
                        title={webhook.webhook_url}
                      >
                        {webhook.webhook_url}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(webhook.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{webhook.trigger_types?.length || 0}</span>
                        {webhook.error_count > 0 && (
                          <Badge variant="destructive">{webhook.error_count} errors</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {webhook.last_triggered ? formatDate(webhook.last_triggered) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedWebhook(webhook)
                                fetchWebhookExecutions(webhook.id)
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>
                                {webhook.external_config?.integration_name || webhook.provider_id} Webhook Details
                              </DialogTitle>
                              <DialogDescription>
                                Webhook configuration and setup instructions
                              </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="setup" className="w-full">
                              <TabsList>
                                <TabsTrigger value="setup">Setup Instructions</TabsTrigger>
                                <TabsTrigger value="url">Webhook URL</TabsTrigger>
                                <TabsTrigger value="executions">Executions</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="setup" className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                  <h4 className="font-medium text-blue-900 mb-2">Setup Instructions</h4>
                                  <p className="text-blue-800 mb-4">
                                    {webhook.external_config?.instructions || 'No setup instructions available.'}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <BookOpen className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm text-blue-700">
                                      Follow the instructions in your {webhook.external_config?.integration_name} developer portal
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-sm font-medium">Integration</Label>
                                    <p className="text-sm text-muted-foreground">
                                      {webhook.external_config?.integration_name || webhook.provider_id}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Category</Label>
                                    <p className="text-sm text-muted-foreground">
                                      {webhook.external_config?.category || 'Unknown'}
                                    </p>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Capabilities</Label>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {webhook.external_config?.capabilities?.slice(0, 3).map((cap: string, i: number) => (
                                        <Badge key={i} variant="outline" className="text-xs">
                                          {cap}
                                        </Badge>
                                      ))}
                                      {webhook.external_config?.capabilities?.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{webhook.external_config.capabilities.length - 3} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <Label className="text-sm font-medium">Trigger Types</Label>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {webhook.trigger_types?.slice(0, 2).map((trigger: string, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                          {trigger}
                                        </Badge>
                                      ))}
                                      {webhook.trigger_types?.length > 2 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{webhook.trigger_types.length - 2} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="url" className="space-y-4">
                                <div>
                                  <Label>Webhook URL</Label>
                                  <div className="flex items-center space-x-2">
                                    <Input 
                                      value={webhook.webhook_url} 
                                      readOnly 
                                      className="font-mono text-sm"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => copyToClipboard(webhook.webhook_url, 'Webhook URL')}
                                    >
                                      <Copy className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-2">
                                    Copy this URL and paste it into your {webhook.external_config?.integration_name} developer portal webhook settings.
                                  </p>
                                </div>
                                
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                  <h4 className="font-medium text-yellow-900 mb-2">Important Notes</h4>
                                  <ul className="text-sm text-yellow-800 space-y-1">
                                    <li>• This webhook URL is unique to your account</li>
                                    <li>• Keep this URL secure and don't share it publicly</li>
                                    <li>• The webhook will trigger workflows when events occur in {webhook.external_config?.integration_name}</li>
                                    <li>• You can monitor webhook executions in the Executions tab</li>
                                  </ul>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="executions">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium">Recent Executions</h4>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => fetchWebhookExecutions(webhook.id)}
                                    >
                                      <RefreshCw className="w-4 h-4 mr-2" />
                                      Refresh
                                    </Button>
                                  </div>
                                  
                                  {executions.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                      No executions yet
                                    </div>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Time</TableHead>
                                          <TableHead>Trigger Type</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Execution Time</TableHead>
                                          <TableHead>Error</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {executions.map((execution) => (
                                          <TableRow key={execution.id}>
                                            <TableCell>{formatDate(execution.triggered_at)}</TableCell>
                                            <TableCell>
                                              <Badge variant="outline">{execution.trigger_type}</Badge>
                                            </TableCell>
                                            <TableCell>
                                              {execution.status === 'success' ? (
                                                <Badge variant="default" className="bg-green-100 text-green-800">
                                                  <CheckCircle className="w-3 h-3 mr-1" />Success
                                                </Badge>
                                              ) : (
                                                <Badge variant="destructive">
                                                  <XCircle className="w-3 h-3 mr-1" />Error
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell>{execution.execution_time_ms}ms</TableCell>
                                            <TableCell>
                                              {execution.error_message ? (
                                                <span className="text-red-600 text-sm">
                                                  {execution.error_message}
                                                </span>
                                              ) : (
                                                <span className="text-muted-foreground">-</span>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(webhook.webhook_url, 'Webhook URL')}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        
                        {webhook.external_config?.setup_required && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            <Settings className="w-3 h-3 mr-1" />
                            Setup Required
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 