import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function showWebhookUrls() {
  console.log('🔗 Webhook URLs for Developer Portals')
  console.log('=' * 50)
  console.log('')

  try {
    // Get all users
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }

    for (const user of users.data) {
      console.log(`👤 User: ${user.email || user.id}`)
      console.log('─' * 30)

      // Get custom webhooks
      const { data: customWebhooks } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('user_id', user.id)

      if (customWebhooks && customWebhooks.length > 0) {
        console.log('📋 Custom Webhooks:')
        customWebhooks.forEach(webhook => {
          console.log(`  • ${webhook.name}: ${webhook.webhook_url}`)
          console.log(`    Method: ${webhook.method}`)
          console.log(`    Status: ${webhook.status}`)
          console.log('')
        })
      }

      // Get integration webhooks
      const { data: integrationWebhooks } = await supabase
        .from('integration_webhooks')
        .select('*')
        .eq('user_id', user.id)

      if (integrationWebhooks && integrationWebhooks.length > 0) {
        console.log('🔌 Integration Webhooks:')
        integrationWebhooks.forEach(webhook => {
          const config = webhook.external_config || {}
          console.log(`  • ${config.integration_name || webhook.provider_id}: ${webhook.webhook_url}`)
          console.log(`    Category: ${config.category || 'N/A'}`)
          console.log(`    Instructions: ${config.instructions || 'N/A'}`)
          console.log(`    Trigger Types: ${webhook.trigger_types.join(', ')}`)
          console.log('')
        })
      }

      // Get workflow webhook endpoints
      const { data: workflows } = await supabase
        .from('workflows')
        .select('id, name, nodes')
        .eq('user_id', user.id)

      if (workflows && workflows.length > 0) {
        console.log('⚡ Workflow Webhook Endpoints:')
        workflows.forEach(workflow => {
          // Check if workflow has trigger nodes
          const nodes = workflow.nodes || []
          const triggerNodes = nodes.filter(node => node.type === 'trigger')
          
          if (triggerNodes.length > 0) {
            console.log(`  • ${workflow.name}:`)
            triggerNodes.forEach(trigger => {
              const webhookUrl = `${supabaseUrl.replace('.supabase.co', '.supabase.co')}/api/workflow/${trigger.data.providerId || 'webhook'}`
              console.log(`    - ${trigger.data.label || trigger.type}: ${webhookUrl}`)
            })
            console.log('')
          }
        })
      }

      console.log('')
      console.log('📝 Setup Instructions:')
      console.log('1. Copy the webhook URLs above')
      console.log('2. Add them to your respective developer portals:')
      console.log('   • GitHub: Repository Settings > Webhooks')
      console.log('   • Slack: App Settings > Event Subscriptions')
      console.log('   • Gmail: Google Cloud Console > Gmail API')
      console.log('   • Notion: Integration Settings > Webhooks')
      console.log('   • Airtable: Base Settings > Webhooks')
      console.log('   • HubSpot: Settings > Integrations > Webhooks')
      console.log('   • Trello: Power-Up Settings > Webhooks')
      console.log('   • Google Sheets: Google Cloud Console > Sheets API')
      console.log('   • Discord: Server Settings > Integrations > Webhooks')
      console.log('   • Zapier: Zap Settings > Webhooks')
      console.log('')
      console.log('3. Test the webhooks to ensure they\'re working')
      console.log('4. Monitor webhook executions in the ChainReact dashboard')
      console.log('')
      console.log('=' * 50)
      console.log('')
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

showWebhookUrls().catch(console.error) 