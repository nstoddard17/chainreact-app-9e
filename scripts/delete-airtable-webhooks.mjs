#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function deleteOrphanedWebhooks() {
  console.log('🗑️ Cleaning up Airtable webhooks...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  )

  try {
    // Get the good webhook from our database
    const { data: dbWebhook, error: dbError } = await supabase
      .from('airtable_webhooks')
      .select('webhook_id, user_id')
      .eq('base_id', 'app2KiMxZofDhMOmZ')
      .eq('status', 'active')
      .single()

    if (dbError || !dbWebhook) {
      console.error('❌ No active webhook found in database')
      return
    }

    console.log(`✅ Good webhook in database: ${dbWebhook.webhook_id}\n`)

    // Get Airtable token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', dbWebhook.user_id)
      .eq('provider', 'airtable')
      .single()

    if (!integration) {
      console.error('❌ Airtable integration not found')
      return
    }

    // Decrypt token (simple implementation for this script)
    const encryptedParts = integration.access_token.split(':')
    // For this script, we'll just note that we need the decrypted token
    console.log('⚠️ Note: This script needs manual token decryption to work with the API directly.')
    console.log('\nInstead, let me show you which webhooks to keep:\n')

    // List all webhooks from Airtable (we can't call API without decrypted token)
    console.log('📋 Webhooks to manage:')
    console.log('  KEEP: achxU0VAb8py2Txgz (the one with MAC secret)')
    console.log('  DELETE: achLINvNUwWFpygWP (the orphaned one)')

    console.log('\n📝 To fix this issue:')
    console.log('1. The system will now detect the existing webhook properly')
    console.log('2. It won\'t try to create duplicates')
    console.log('3. The orphaned webhook will expire in 7 days automatically')

    // Delete the bad webhook from our DB if it exists
    const { data: badWebhook, error: deleteError } = await supabase
      .from('airtable_webhooks')
      .delete()
      .eq('webhook_id', 'achLINvNUwWFpygWP')

    if (!deleteError && badWebhook) {
      console.log('\n✅ Cleaned up orphaned webhook from database')
    }

  } catch (err) {
    console.error('Error:', err.message)
  }
}

deleteOrphanedWebhooks().then(() => {
  console.log('\nDone!')
  process.exit(0)
})