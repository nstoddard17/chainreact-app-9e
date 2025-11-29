#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function cleanupWebhooks() {
  console.log('🧹 Cleaning up duplicate Airtable webhooks...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  )

  try {
    // Get all webhooks for the base
    const { data: webhooks, error } = await supabase
      .from('airtable_webhooks')
      .select('*')
      .eq('base_id', 'app2KiMxZofDhMOmZ')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching webhooks:', error.message)
      return
    }

    console.log(`📊 Found ${webhooks?.length || 0} webhook(s) for base app2KiMxZofDhMOmZ:\n`)

    webhooks?.forEach((webhook, i) => {
      console.log(`Webhook ${i + 1}:`)
      console.log(`  - ID: ${webhook.id}`)
      console.log(`  - Webhook ID: ${webhook.webhook_id}`)
      console.log(`  - Has MAC Secret: ${!!webhook.mac_secret_base64}`)
      console.log(`  - Status: ${webhook.status}`)
      console.log(`  - Created: ${webhook.created_at}`)
      console.log('')
    })

    // Find the webhook WITH a MAC secret (the good one)
    const goodWebhook = webhooks?.find(w => w.mac_secret_base64)
    const badWebhooks = webhooks?.filter(w => !w.mac_secret_base64)

    if (goodWebhook && badWebhooks?.length > 0) {
      console.log('✅ Found good webhook with MAC secret:', goodWebhook.webhook_id)
      console.log(`🗑️ Deleting ${badWebhooks.length} webhook(s) without MAC secret...`)

      for (const badWebhook of badWebhooks) {
        const { error: deleteError } = await supabase
          .from('airtable_webhooks')
          .delete()
          .eq('id', badWebhook.id)

        if (deleteError) {
          console.error(`❌ Failed to delete webhook ${badWebhook.id}:`, deleteError.message)
        } else {
          console.log(`   ✅ Deleted webhook ${badWebhook.webhook_id}`)
        }
      }

      console.log('\n✅ Cleanup complete! Only the webhook with MAC secret remains.')
    } else if (!goodWebhook) {
      console.log('❌ No webhook with MAC secret found!')
      console.log('   Please pause and reactivate your workflow to create a new webhook.')

      // Delete all webhooks since none have MAC secret
      if (webhooks?.length > 0) {
        console.log(`🗑️ Deleting all ${webhooks.length} webhook(s) without MAC secret...`)

        for (const webhook of webhooks) {
          const { error: deleteError } = await supabase
            .from('airtable_webhooks')
            .delete()
            .eq('id', webhook.id)

          if (!deleteError) {
            console.log(`   ✅ Deleted webhook ${webhook.webhook_id}`)
          }
        }
      }
    } else {
      console.log('✅ No duplicates found. Database is clean.')
    }

  } catch (err) {
    console.error('Error:', err.message)
  }
}

cleanupWebhooks().then(() => {
  console.log('\nDone!')
  process.exit(0)
})