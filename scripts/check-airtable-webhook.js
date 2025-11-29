#!/usr/bin/env node

// Script to check Airtable webhook status and manually trigger a test

const baseId = 'app2KiMxZofDhMOmZ'
const webhookId = 'achLINvNUwWFpygWP'

async function checkWebhookStatus() {
  console.log('🔍 Checking Airtable webhook status...\n')

  // First, let's check the webhook details
  try {
    // Get the token from the database
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    )

    // Get the webhook from our database
    const { data: webhook, error: webhookError } = await supabase
      .from('airtable_webhooks')
      .select('*')
      .eq('webhook_id', webhookId)
      .single()

    if (webhookError || !webhook) {
      console.error('❌ Webhook not found in database')
      return
    }

    console.log('📋 Webhook in database:')
    console.log(`  - Status: ${webhook.status}`)
    console.log(`  - Base ID: ${webhook.base_id}`)
    console.log(`  - Expires: ${webhook.expiration_time}`)
    console.log(`  - Last cursor: ${webhook.last_cursor || 'none'}`)

    // Get the Airtable integration token
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', webhook.user_id)
      .eq('provider', 'airtable')
      .single()

    if (intError || !integration) {
      console.error('❌ Airtable integration not found')
      return
    }

    const { decrypt } = require('@/lib/security/encryption')
    const token = decrypt(integration.access_token, process.env.ENCRYPTION_KEY)

    console.log('\n🔄 Checking webhook on Airtable API...')

    // Check webhook status on Airtable
    const webhookResponse = await fetch(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!webhookResponse.ok) {
      const error = await webhookResponse.text()
      console.error('❌ Failed to get webhook from Airtable:', error)
      return
    }

    const webhookData = await webhookResponse.json()
    console.log('\n📊 Webhook status from Airtable:')
    console.log(`  - ID: ${webhookData.id}`)
    console.log(`  - Notification URL: ${webhookData.notificationUrl}`)
    console.log(`  - Is Expired: ${webhookData.isExpired || false}`)
    console.log(`  - Expiration: ${webhookData.expirationTime}`)
    console.log(`  - Are notifications enabled: ${webhookData.areNotificationsEnabled !== false}`)

    // Check if notifications are actually being sent
    if (webhookData.disabledTime) {
      console.log(`  ⚠️ NOTIFICATIONS DISABLED AT: ${webhookData.disabledTime}`)
      console.log(`  ⚠️ DISABLED REASON: ${webhookData.disabledReason || 'Unknown'}`)
    }

    // Check for any pending payloads
    console.log('\n📬 Checking for pending payloads...')
    const payloadResponse = await fetch(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!payloadResponse.ok) {
      const error = await payloadResponse.text()
      console.error('❌ Failed to fetch payloads:', error)
      return
    }

    const payloadData = await payloadResponse.json()
    console.log(`  - Pending payloads: ${payloadData.payloads?.length || 0}`)

    if (payloadData.payloads && payloadData.payloads.length > 0) {
      console.log('\n⚠️ FOUND UNPROCESSED PAYLOADS!')
      console.log('These events were not delivered to your webhook:')
      payloadData.payloads.forEach((p, i) => {
        console.log(`\n  Payload ${i + 1}:`)
        console.log(`    - Timestamp: ${p.timestamp}`)
        console.log(`    - Has created records: ${!!p.created_tables_by_id}`)
        console.log(`    - Has changed records: ${!!p.changed_tables_by_id}`)

        if (p.created_tables_by_id) {
          Object.entries(p.created_tables_by_id).forEach(([tableId, table]) => {
            const recordCount = Object.keys(table.created_records_by_id || {}).length
            console.log(`    - Table "${table.name}": ${recordCount} new records`)
          })
        }
      })

      console.log('\n💡 This means Airtable IS detecting your changes but NOT sending webhooks!')
      console.log('   The webhook might be paused or the URL might be unreachable.')
    } else {
      console.log('  ✅ No pending payloads (webhook is up to date)')
    }

    // List all webhooks on the base to see if there are duplicates
    console.log('\n📋 Listing all webhooks on this base...')
    const allWebhooksResponse = await fetch(
      `https://api.airtable.com/v0/bases/${baseId}/webhooks`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (allWebhooksResponse.ok) {
      const allWebhooks = await allWebhooksResponse.json()
      console.log(`  Total webhooks on base: ${allWebhooks.webhooks?.length || 0}`)
      allWebhooks.webhooks?.forEach(w => {
        console.log(`\n  - Webhook ${w.id}:`)
        console.log(`      URL: ${w.notificationUrl}`)
        console.log(`      Active: ${!w.isExpired && !w.disabledTime}`)
        if (w.disabledTime) {
          console.log(`      DISABLED: ${w.disabledReason || 'Unknown reason'}`)
        }
      })
    }

  } catch (error) {
    console.error('❌ Error checking webhook:', error)
  }
}

checkWebhookStatus().then(() => {
  console.log('\n✅ Check complete!')
  process.exit(0)
}).catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})