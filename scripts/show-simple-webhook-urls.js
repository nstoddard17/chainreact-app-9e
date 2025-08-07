#!/usr/bin/env node

// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainreact.app'

function showSimpleWebhookUrls() {
  console.log('🔗 Simplified Webhook URLs')
  console.log('=' * 50)
  console.log('')
  console.log(`Base URL: ${baseUrl}`)
  console.log('')
  
  const integrations = [
    // Google Services
    { id: 'gmail', name: 'Gmail', category: 'Communication' },
    { id: 'google-calendar', name: 'Google Calendar', category: 'Productivity' },
    { id: 'google-drive', name: 'Google Drive', category: 'Storage' },
    { id: 'google-sheets', name: 'Google Sheets', category: 'Productivity' },
    { id: 'google-docs', name: 'Google Docs', category: 'Productivity' },
    { id: 'youtube', name: 'YouTube', category: 'Social Media' },
    { id: 'youtube-studio', name: 'YouTube Studio', category: 'Social Media' },

    // Communication Platforms
    { id: 'slack', name: 'Slack', category: 'Communication' },
    { id: 'discord', name: 'Discord', category: 'Communication' },
    { id: 'teams', name: 'Microsoft Teams', category: 'Communication' },
    { id: 'microsoft-outlook', name: 'Microsoft Outlook', category: 'Communication' },
    { id: 'onedrive', name: 'OneDrive', category: 'Storage' },
    { id: 'microsoft-onenote', name: 'OneNote', category: 'Productivity' },

    // Social Media
    { id: 'twitter', name: 'Twitter', category: 'Social Media' },
    { id: 'facebook', name: 'Facebook', category: 'Social Media' },
    { id: 'instagram', name: 'Instagram', category: 'Social Media' },
    { id: 'tiktok', name: 'TikTok', category: 'Social Media' },
    { id: 'linkedin', name: 'LinkedIn', category: 'Social Media' },

    // Development & Productivity
    { id: 'github', name: 'GitHub', category: 'Development' },
    { id: 'gitlab', name: 'GitLab', category: 'Development' },
    { id: 'notion', name: 'Notion', category: 'Productivity' },
    { id: 'trello', name: 'Trello', category: 'Productivity' },

    // Business & CRM
    { id: 'hubspot', name: 'HubSpot', category: 'Business' },
    { id: 'airtable', name: 'Airtable', category: 'Productivity' },
    { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing' },

    // E-commerce & Payments
    { id: 'shopify', name: 'Shopify', category: 'E-commerce' },
    { id: 'stripe', name: 'Stripe', category: 'Payments' },
    { id: 'paypal', name: 'PayPal', category: 'Payments' },

    // Cloud Storage
    { id: 'box', name: 'Box', category: 'Storage' },
    { id: 'dropbox', name: 'Dropbox', category: 'Storage' },

    // Other Integrations
    { id: 'blackbaud', name: 'Blackbaud', category: 'Non-profit' },
    { id: 'gumroad', name: 'Gumroad', category: 'E-commerce' },
    { id: 'manychat', name: 'ManyChat', category: 'Communication' },
    { id: 'beehiiv', name: 'Beehiiv', category: 'Marketing' },
    { id: 'kit', name: 'Kit', category: 'Marketing' }
  ]

  console.log('📋 Simplified Webhook URLs:')
  console.log('')
  
  integrations.forEach((integration, index) => {
    const webhookUrl = `${baseUrl}/api/workflow/${integration.id}`
    console.log(`${index + 1}. ${integration.name} (${integration.category})`)
    console.log(`   URL: ${webhookUrl}`)
    console.log('')
  })

  console.log('🎯 Setup Instructions:')
  console.log('')
  console.log('1. Copy the webhook URL for each integration you want to use')
  console.log('2. Go to the integration\'s developer portal/console')
  console.log('3. Find the webhook configuration section')
  console.log('4. Paste the webhook URL')
  console.log('5. Select the events you want to listen to')
  console.log('6. Save the configuration')
  console.log('')
  console.log('📊 What happens when webhooks are triggered:')
  console.log('• External service sends data to your webhook URL')
  console.log('• Your system finds all workflows with matching triggers')
  console.log('• All matching workflows are executed')
  console.log('• All executions are logged and can be monitored')
  console.log('')
  console.log('🔧 Testing Webhooks:')
  console.log('• Use the webhook testing tools in each developer portal')
  console.log('• Send a GET request to test if the endpoint is active')
  console.log('• Monitor the executions tab in your webhook dashboard')
  console.log('• Check the logs for any errors or issues')
  console.log('')
  console.log('⚠️  Important Notes:')
  console.log('• All webhooks now use the simplified format: /api/workflow/{provider}')
  console.log('• Multiple workflows can use the same webhook URL')
  console.log('• The system automatically finds and executes all matching workflows')
  console.log('• Each webhook execution is logged with detailed information')
  console.log('')
  console.log('=' * 50)
}

showSimpleWebhookUrls()
