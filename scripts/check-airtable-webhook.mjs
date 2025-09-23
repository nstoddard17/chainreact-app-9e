#!/usr/bin/env node

// Script to check Airtable webhook status
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const baseId = 'app2KiMxZofDhMOmZ'
const webhookId = 'achLINvNUwWFpygWP'

async function checkWebhookStatus() {
  console.log('🔍 Checking Airtable webhook status...\n')

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Get the webhook from our database
    const { data: webhook, error: webhookError } = await supabase
      .from('airtable_webhooks')
      .select('*')
      .eq('webhook_id', webhookId)
      .single()

    if (webhookError || !webhook) {
      console.error('❌ Webhook not found in database:', webhookError?.message || 'No webhook found')
      console.log('\n💡 Try pausing and reactivating your workflow to re-register the webhook.')
      return
    }

    console.log('📋 Webhook in database:')
    console.log(`  - Status: ${webhook.status}`)
    console.log(`  - Base ID: ${webhook.base_id}`)
    console.log(`  - User ID: ${webhook.user_id}`)
    console.log(`  - Webhook ID: ${webhook.webhook_id}`)
    console.log(`  - Expires: ${webhook.expiration_time || 'No expiration set'}`)
    console.log(`  - MAC Secret exists: ${!!webhook.mac_secret_base64}`)
    console.log(`  - Metadata:`, webhook.metadata)

    // Check expiration
    if (webhook.expiration_time) {
      const expires = new Date(webhook.expiration_time)
      const now = new Date()
      if (expires < now) {
        console.log('\n⚠️ WEBHOOK IS EXPIRED!')
        console.log('   Please deactivate and reactivate your workflow to renew it.')
      } else {
        const daysLeft = Math.floor((expires - now) / (1000 * 60 * 60 * 24))
        console.log(`\n✅ Webhook expires in ${daysLeft} days`)
      }
    }

    // Get the Airtable integration token
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('provider, status, created_at')
      .eq('user_id', webhook.user_id)
      .eq('provider', 'airtable')
      .single()

    if (intError || !integration) {
      console.error('❌ Airtable integration not found for user')
      return
    }

    console.log('\n✅ Airtable Integration:')
    console.log(`  - Status: ${integration.status}`)
    console.log(`  - Created: ${integration.created_at}`)

    // Check if we can reach the webhook endpoint
    console.log('\n🌐 Testing webhook endpoint accessibility...')
    try {
      const testResponse = await fetch('https://f98c9243bd02.ngrok-free.app/api/workflow/airtable')

      if (testResponse.ok) {
        const data = await testResponse.json()
        console.log('✅ Webhook endpoint is reachable')
        console.log(`   Endpoint: ${data.message}`)
      } else {
        console.log('❌ Webhook endpoint returned error:', testResponse.status)
      }
    } catch (fetchError) {
      console.log('❌ Cannot reach webhook endpoint!')
      console.log(`   Error: ${fetchError.message}`)
      console.log('   This would prevent Airtable from delivering webhooks.')
      console.log('   Make sure ngrok is running and the URL is correct.')
    }

    // Check for active workflows
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, status, trigger_type, trigger_config')
      .eq('user_id', webhook.user_id)
      .eq('status', 'active')

    if (workflows) {
      const airtableWorkflows = workflows.filter(w =>
        w.trigger_type?.includes('airtable') || w.trigger_config?.providerId === 'airtable'
      )

      console.log(`\n📊 Active Airtable workflows: ${airtableWorkflows.length}`)
      airtableWorkflows.forEach(w => {
        console.log(`  - ${w.name}:`)
        console.log(`      Status: ${w.status}`)
        console.log(`      Trigger: ${w.trigger_type}`)
        console.log(`      Base: ${w.trigger_config?.baseId === baseId ? '✅ Matches' : '❌ Different base'}`)
        console.log(`      Table: ${w.trigger_config?.tableName || 'All tables'}`)
      })
    }

    // Show troubleshooting steps
    console.log('\n📝 Troubleshooting steps:')
    console.log('1. ✅ ngrok is running and accessible')
    console.log('2. Try pausing and reactivating your workflow')
    console.log('3. Add a new record and wait 10 seconds')
    console.log('4. Watch for "🔔🔔🔔 AIRTABLE WEBHOOK RECEIVED!" in console')
    console.log('5. If nothing happens, try creating a new workflow')
    console.log('6. Check Airtable\'s API status: https://status.airtable.com/')
    console.log('\n💡 Note: Airtable webhooks can have a delay of 1-30 seconds')

  } catch (error) {
    console.error('❌ Error checking webhook:', error.message)
  }
}

checkWebhookStatus().then(() => {
  console.log('\n✅ Check complete!')
  process.exit(0)
}).catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})