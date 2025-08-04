import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testRealGmailWebhook() {
  try {
    console.log('🧪 Testing Real Gmail Webhook Integration\n')
    
    // 1. Check workflow configuration
    console.log('1️⃣ Checking Gmail webhook workflows...')
    
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, status, nodes')
      .eq('status', 'active')
    
    if (workflowError) {
      console.error('❌ Error checking workflows:', workflowError)
      return
    }
    
    const gmailWorkflows = workflows?.filter(workflow => {
      return workflow.nodes?.some(node => 
        node.data?.isTrigger && 
        node.data?.triggerType === 'webhook' &&
        node.data?.triggerConfig?.provider === 'gmail'
      )
    }) || []
    
    console.log(`🔗 Found ${gmailWorkflows.length} Gmail webhook workflows:`)
    gmailWorkflows.forEach(workflow => {
      console.log(`   - "${workflow.name}" (ID: ${workflow.id})`)
    })
    
    // 2. Test webhook endpoint with realistic payload
    console.log('\n2️⃣ Testing webhook endpoint with realistic Gmail payload...')
    
    const realisticGmailPayload = {
      type: 'message.new',
      message_id: 'real-gmail-123',
      thread_id: 'real-thread-456',
      from: 'sender@example.com',
      to: 'your-email@gmail.com',
      subject: 'Real Email Test - This should trigger your workflow',
      body: 'This is a real email body that should trigger your workflow. It contains important information that needs to be processed.',
      receivedAt: new Date().toISOString(),
      labelIds: ['INBOX'],
      snippet: 'This is a real email body that should trigger your workflow...',
      attachments: []
    }
    
    console.log('📤 Sending realistic Gmail payload to webhook...')
    console.log('Payload preview:', {
      type: realisticGmailPayload.type,
      from: realisticGmailPayload.from,
      subject: realisticGmailPayload.subject,
      body: realisticGmailPayload.body.substring(0, 50) + '...'
    })
    
    // 3. Check execution sessions before test
    console.log('\n3️⃣ Checking execution sessions before test...')
    
    const { data: sessionsBefore, error: sessionError } = await supabase
      .from('workflow_execution_sessions')
      .select('*')
      .eq('session_type', 'webhook')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (sessionError) {
      console.error('❌ Error checking sessions:', sessionError)
    } else {
      console.log(`📊 Found ${sessionsBefore?.length || 0} recent webhook execution sessions`)
    }
    
    // 4. Instructions for real testing
    console.log('\n🎯 How to Test with Real Emails:')
    console.log('')
    console.log('📧 Method 1: Test with Real Gmail Integration')
    console.log('   1. Go to http://localhost:3000/integrations')
    console.log('   2. Connect your Gmail account')
    console.log('   3. Set up Gmail Watch API to send webhooks to:')
    console.log('      https://chainreact.app/api/webhooks/gmail')
    console.log('   4. Send an email to your Gmail account')
    console.log('   5. Watch for webhook triggers in your terminal')
    console.log('')
    console.log('🧪 Method 2: Test with Simulated Webhook')
    console.log('   Run this command to simulate a real Gmail webhook:')
    console.log('')
    console.log(`   curl -X POST http://localhost:3000/api/webhooks/gmail \\`)
    console.log(`     -H "Content-Type: application/json" \\`)
    console.log(`     -d '{"type": "message.new", "message_id": "test-123", "from": "test@example.com", "subject": "Test Email", "body": "This should trigger your workflow"}'`)
    console.log('')
    console.log('🔍 Method 3: Monitor in Real-Time')
    console.log('   1. Keep your terminal open to see webhook logs')
    console.log('   2. Check the database for new execution sessions')
    console.log('   3. Watch your workflow actions execute (AI summary, etc.)')
    console.log('')
    console.log('📊 What to Look For:')
    console.log('   ✅ Webhook received logs in terminal')
    console.log('   ✅ New execution sessions in database')
    console.log('   ✅ Workflow actions completing successfully')
    console.log('   ✅ AI summaries, Discord messages, etc.')
    console.log('')
    console.log('🚀 Your webhook system is ready for real email testing!')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testRealGmailWebhook() 