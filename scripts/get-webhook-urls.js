import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function getWebhookUrls() {
  console.log('🔗 Webhook URLs for Developer Portals')
  console.log('=' * 60)
  console.log(`Base URL: ${baseUrl}`)
  console.log('')
  
  const integrations = [
    // Google Services
    { id: 'gmail', name: 'Gmail', category: 'Communication' },
    { id: 'google-calendar', name: 'Google Calendar', category: 'Productivity' },
    { id: 'google-drive', name: 'Google Drive', category: 'Storage' },
    { id: 'google-sheets', name: 'Google Sheets', category: 'Productivity' },
    { id: 'google-docs', name: 'Google Docs', category: 'Productivity' },
    { id: 'youtube', name: 'YouTube', category: 'Social' },
    { id: 'youtube-studio', name: 'YouTube Studio', category: 'Social' },

    // Microsoft Services
    { id: 'teams', name: 'Microsoft Teams', category: 'Communication' },
    { id: 'onedrive', name: 'OneDrive', category: 'Storage' },

    // Communication Platforms
    { id: 'slack', name: 'Slack', category: 'Communication' },
    { id: 'discord', name: 'Discord', category: 'Communication' },

    // Social Media
    { id: 'twitter', name: 'Twitter/X', category: 'Social' },
    { id: 'facebook', name: 'Facebook', category: 'Social' },
    { id: 'instagram', name: 'Instagram', category: 'Social' },
    { id: 'tiktok', name: 'TikTok', category: 'Social' },
    { id: 'linkedin', name: 'LinkedIn', category: 'Social' },

    // Development & Productivity
    { id: 'github', name: 'GitHub', category: 'Developer' },
    { id: 'gitlab', name: 'GitLab', category: 'Developer' },
    { id: 'notion', name: 'Notion', category: 'Productivity' },
    { id: 'trello', name: 'Trello', category: 'Productivity' },

    // Business & CRM
    { id: 'hubspot', name: 'HubSpot', category: 'CRM' },
    { id: 'airtable', name: 'Airtable', category: 'Productivity' },
    { id: 'mailchimp', name: 'Mailchimp', category: 'Marketing' },

    // E-commerce & Payments
    { id: 'shopify', name: 'Shopify', category: 'E-commerce' },
    { id: 'paypal', name: 'PayPal', category: 'Payments' },
    { id: 'stripe', name: 'Stripe', category: 'Payments' },

    // Cloud Storage
    { id: 'box', name: 'Box', category: 'Storage' },
    { id: 'dropbox', name: 'Dropbox', category: 'Storage' },

    // Other Integrations
    { id: 'blackbaud', name: 'Blackbaud', category: 'Non-profit' },
    { id: 'gumroad', name: 'Gumroad', category: 'E-commerce' },
    { id: 'manychat', name: 'ManyChat', category: 'Communication' }
  ]

  console.log('📋 Integration Webhook URLs:')
  console.log('')
  
  integrations.forEach((integration, index) => {
    const webhookUrl = `${baseUrl}/api/integration-webhooks/${integration.id}`
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
  console.log('• Your system processes the data and transforms it')
  console.log('• Workflows with matching triggers are executed')
  console.log('• All executions are logged and can be monitored')
  console.log('')
  console.log('🔧 Testing Webhooks:')
  console.log('• Use the webhook testing tools in each developer portal')
  console.log('• Monitor the executions tab in your webhook dashboard')
  console.log('• Check the logs for any errors or issues')
  console.log('')
  console.log('⚠️  Important Notes:')
  console.log('• Webhook URLs are unique to your account')
  console.log('• Keep URLs secure and don\'t share publicly')
  console.log('• Some integrations require additional setup (OAuth, etc.)')
  console.log('• Monitor webhook health and error rates')
}

getWebhookUrls() 