#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from the parent directory
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getCurrentWebhookUrl() {
  // Check for ngrok URL first
  if (process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL) {
    return `${process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL}/api/workflow/airtable`
  }

  // Fall back to production URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainreact.app'
  return `${baseUrl}/api/workflow/airtable`
}

async function checkWebhooks() {
  console.log('🔍 Checking Airtable Webhooks')
  console.log('==============================\n')

  console.log('📍 Current Expected Webhook URL:')
  console.log(`   ${getCurrentWebhookUrl()}\n`)

  // Get all active webhooks from database
  const { data: webhooks, error } = await supabase
    .from('airtable_webhooks')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching webhooks:', error)
    return
  }

  if (!webhooks || webhooks.length === 0) {
    console.log('⚠️  No active webhooks found in database')
    return
  }

  console.log(`📋 Found ${webhooks.length} active webhook(s):\n`)

  for (const webhook of webhooks) {
    console.log(`Webhook ${webhook.id}:`)
    console.log(`  User ID: ${webhook.user_id}`)
    console.log(`  Base ID: ${webhook.base_id}`)
    console.log(`  Webhook ID: ${webhook.webhook_id}`)
    console.log(`  Has MAC Secret: ${webhook.mac_secret_base64 ? '✅ Yes' : '❌ No'}`)
    console.log(`  Created: ${new Date(webhook.created_at).toLocaleString()}`)
    console.log(`  Last Updated: ${new Date(webhook.updated_at).toLocaleString()}`)

    if (webhook.metadata?.skip_before_timestamp) {
      console.log(`  ⚠️  Skip Before: ${new Date(webhook.metadata.skip_before_timestamp).toLocaleString()}`)
    }

    // Check if this webhook needs the URL to be updated
    console.log(`  Status: ${webhook.status === 'active' ? '🟢 Active' : '🔴 ' + webhook.status}`)
    console.log('')
  }

  console.log('\n💡 If your webhooks aren\'t working:')
  console.log('   1. The webhook URL might have changed (especially with ngrok)')
  console.log('   2. Run: node scripts/reregister-airtable-webhook.mjs <userId> <baseId>')
  console.log('   3. Or remove NEXT_PUBLIC_WEBHOOK_HTTPS_URL from .env.local to use production URL')
}

checkWebhooks().catch(console.error)