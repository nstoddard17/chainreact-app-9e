#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function checkWebhookData() {
  console.log('🔍 Checking webhook data in database...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Get all webhooks
    const { data: webhooks, error } = await supabase
      .from('airtable_webhooks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching webhooks:', error.message)
      return
    }

    console.log(`📊 Found ${webhooks?.length || 0} webhook(s) in database:\n`)

    webhooks?.forEach((webhook, i) => {
      console.log(`Webhook ${i + 1}:`)
      console.log(`  - ID: ${webhook.id}`)
      console.log(`  - Webhook ID: ${webhook.webhook_id}`)
      console.log(`  - Base ID: ${webhook.base_id}`)
      console.log(`  - User ID: ${webhook.user_id}`)
      console.log(`  - Status: ${webhook.status}`)
      console.log(`  - Created: ${webhook.created_at}`)
      console.log(`  - Expires: ${webhook.expiration_time || 'No expiration'}`)
      console.log(`  - Has MAC Secret: ${!!webhook.mac_secret_base64}`)
      console.log(`  - Metadata:`, JSON.stringify(webhook.metadata, null, 2))
      console.log('')
    })

    // Check if the webhook is expired
    const activeWebhooks = webhooks?.filter(w => {
      if (w.status !== 'active') return false
      if (!w.expiration_time) return true
      return new Date(w.expiration_time) > new Date()
    })

    console.log(`\n✅ Active webhooks: ${activeWebhooks?.length || 0}`)

    if (activeWebhooks?.length === 0) {
      console.log('\n⚠️ No active webhooks found!')
      console.log('Please deactivate and reactivate your workflow.')
    }

  } catch (err) {
    console.error('Error:', err.message)
  }
}

checkWebhookData().then(() => {
  console.log('\nDone!')
  process.exit(0)
})