import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkWebhookLogs() {
  try {
    console.log('🔍 Checking webhook execution logs...\n')
    
    // Check recent execution sessions
    const { data: sessions, error: sessionError } = await supabase
      .from('workflow_execution_sessions')
      .select('*')
      .eq('session_type', 'webhook')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (sessionError) {
      console.error('❌ Error checking sessions:', sessionError)
      return
    }
    
    console.log(`📊 Found ${sessions?.length || 0} recent webhook execution sessions:`)
    sessions?.forEach(session => {
      console.log(`   - Session ${session.id.substring(0, 8)}... (${session.status})`)
      console.log(`     Created: ${new Date(session.created_at).toLocaleString()}`)
      if (session.context) {
        console.log(`     Context: ${JSON.stringify(session.context, null, 2)}`)
      }
      console.log('')
    })
    
    // Check webhook event logs
    const { data: events, error: eventError } = await supabase
      .from('webhook_event_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (eventError) {
      console.error('❌ Error checking event logs:', eventError)
    } else {
      console.log(`📝 Found ${events?.length || 0} recent webhook event logs:`)
      events?.forEach(event => {
        console.log(`   - ${event.provider} (${event.status}) - ${new Date(event.created_at).toLocaleString()}`)
        console.log(`     Event: ${event.event_type}`)
        console.log(`     Processing time: ${event.processing_time_ms}ms`)
        if (event.result) {
          console.log(`     Result: ${JSON.stringify(event.result, null, 2)}`)
        }
        console.log('')
      })
    }
    
    // Check webhook events table
    const { data: webhookEvents, error: webhookEventError } = await supabase
      .from('webhook_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (webhookEventError) {
      console.error('❌ Error checking webhook events:', webhookEventError)
    } else {
      console.log(`🎯 Found ${webhookEvents?.length || 0} recent webhook events:`)
      webhookEvents?.forEach(event => {
        console.log(`   - ${event.provider} (${event.status}) - ${new Date(event.created_at).toLocaleString()}`)
        console.log(`     Request ID: ${event.request_id}`)
        console.log('')
      })
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the check
checkWebhookLogs() 