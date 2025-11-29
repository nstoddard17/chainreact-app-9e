#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function deleteWebhook() {
  console.log('🗑️ Deleting existing webhook to force re-creation with MAC secret...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  )

  try {
    // Delete from our database
    const { error } = await supabase
      .from('airtable_webhooks')
      .delete()
      .eq('webhook_id', 'achLINvNUwWFpygWP')

    if (error) {
      console.error('Error deleting:', error.message)
    } else {
      console.log('✅ Webhook deleted from database')
      console.log('\nNow please:')
      console.log('1. Pause your workflow')
      console.log('2. Reactivate it')
      console.log('3. This will create a fresh webhook with MAC secret')
    }

  } catch (err) {
    console.error('Error:', err.message)
  }
}

deleteWebhook().then(() => {
  console.log('\nDone!')
  process.exit(0)
})