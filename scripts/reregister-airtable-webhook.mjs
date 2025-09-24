#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from the parent directory
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getWebhookUrl() {
  // Check for ngrok URL first
  if (process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL) {
    console.log(`📡 Using ngrok URL: ${process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL}`)
    return `${process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL}/api/workflow/airtable`
  }

  // Fall back to production URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainreact.app'
  console.log(`🌐 Using production URL: ${baseUrl}`)
  return `${baseUrl}/api/workflow/airtable`
}

async function reregisterWebhook(userId, baseId) {
  console.log(`\n🔄 Re-registering webhook for base ${baseId}...`)

  // Get the integration token
  const { data: integration, error: intError } = await supabase
    .from('integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'airtable')
    .single()

  if (!integration) {
    console.error('❌ No Airtable integration found for user')
    return false
  }

  // Decrypt the token (simplified - in production use proper decryption)
  const token = integration.access_token

  // Get existing webhook info
  const { data: existingWebhook } = await supabase
    .from('airtable_webhooks')
    .select('*')
    .eq('user_id', userId)
    .eq('base_id', baseId)
    .eq('status', 'active')
    .single()

  if (existingWebhook) {
    console.log(`🗑️  Deleting old webhook ${existingWebhook.webhook_id}...`)

    // Delete from Airtable
    try {
      const deleteRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${existingWebhook.webhook_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (deleteRes.ok) {
        console.log('✅ Old webhook deleted from Airtable')
      } else {
        console.log('⚠️  Could not delete old webhook from Airtable (may already be gone)')
      }
    } catch (err) {
      console.log('⚠️  Error deleting old webhook:', err.message)
    }

    // Mark as inactive in database
    await supabase
      .from('airtable_webhooks')
      .update({ status: 'inactive' })
      .eq('id', existingWebhook.id)
  }

  // Create new webhook
  const newWebhookUrl = getWebhookUrl()
  console.log(`📍 Creating new webhook with URL: ${newWebhookUrl}`)

  const webhookPayload = {
    notificationUrl: newWebhookUrl,
    specification: {
      options: {
        filters: {
          dataTypes: ["tableData"]
        }
      }
    }
  }

  try {
    const createRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    })

    if (!createRes.ok) {
      const error = await createRes.text()
      console.error('❌ Failed to create webhook:', error)
      return false
    }

    const webhook = await createRes.json()
    console.log(`✅ New webhook created: ${webhook.id}`)
    console.log(`🔑 MAC Secret: ${webhook.macSecretBase64 ? 'Present' : 'Missing'}`)

    // Save to database
    await supabase
      .from('airtable_webhooks')
      .upsert({
        user_id: userId,
        base_id: baseId,
        webhook_id: webhook.id,
        mac_secret_base64: webhook.macSecretBase64,
        status: 'active',
        metadata: {}
      })

    console.log('💾 Webhook saved to database')
    return true

  } catch (err) {
    console.error('❌ Error creating webhook:', err)
    return false
  }
}

async function main() {
  console.log('🔧 Airtable Webhook Re-registration Tool')
  console.log('========================================')

  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log(`
Usage: node reregister-airtable-webhook.mjs <userId> <baseId>

Example: node reregister-airtable-webhook.mjs 123e4567-e89b-12d3-a456-426614174000 app2KiMxZofDhMOmZ

To find your userId and baseId:
1. Check the airtable_webhooks table in Supabase
2. Or check the workflows that use Airtable triggers
`)
    process.exit(1)
  }

  const [userId, baseId] = args

  console.log(`\n📋 Configuration:`)
  console.log(`   User ID: ${userId}`)
  console.log(`   Base ID: ${baseId}`)
  console.log(`   Webhook URL: ${getWebhookUrl()}`)

  const success = await reregisterWebhook(userId, baseId)

  if (success) {
    console.log('\n✅ Webhook re-registered successfully!')
    console.log('   Your Airtable triggers should now work with the current URL.')
  } else {
    console.log('\n❌ Failed to re-register webhook')
    console.log('   Please check the errors above and try again.')
  }

  process.exit(success ? 0 : 1)
}

main().catch(console.error)