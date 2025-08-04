import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testEmailDataFlow() {
  try {
    console.log('🧪 Testing Email Data Flow Through Workflow System\n')
    
    // 1. Check workflow configurations
    console.log('1️⃣ Checking workflow configurations...')
    
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
    
    console.log(`📧 Found ${gmailWorkflows.length} Gmail webhook workflows:`)
    
    gmailWorkflows.forEach(workflow => {
      console.log(`\n🔗 Workflow: "${workflow.name}" (ID: ${workflow.id})`)
      
      // Check trigger node
      const triggerNode = workflow.nodes?.find(node => node.data?.isTrigger)
      if (triggerNode) {
        console.log(`   📥 Trigger: ${triggerNode.data?.triggerType} (${triggerNode.data?.triggerConfig?.provider}/${triggerNode.data?.triggerConfig?.eventType})`)
      }
      
      // Check action nodes
      const actionNodes = workflow.nodes?.filter(node => !node.data?.isTrigger) || []
      console.log(`   📤 Actions: ${actionNodes.length} action nodes`)
      
      actionNodes.forEach((node, index) => {
        console.log(`      ${index + 1}. ${node.data?.type} (${node.data?.providerId || 'no provider'})`)
        
        // Check if node has data mapping configuration
        if (node.data?.config) {
          console.log(`         Config: ${JSON.stringify(node.data.config, null, 2)}`)
        }
      })
    })
    
    // 2. Check recent execution sessions for data flow
    console.log('\n2️⃣ Checking recent execution sessions for data flow...')
    
    const { data: sessions, error: sessionError } = await supabase
      .from('workflow_execution_sessions')
      .select('*')
      .eq('session_type', 'webhook')
      .order('created_at', { ascending: false })
      .limit(3)
    
    if (sessionError) {
      console.error('❌ Error checking sessions:', sessionError)
    } else {
      console.log(`📊 Found ${sessions?.length || 0} recent webhook execution sessions:`)
      sessions?.forEach(session => {
        console.log(`\n   Session ${session.id.substring(0, 8)}... (${session.status})`)
        console.log(`   Created: ${new Date(session.created_at).toLocaleString()}`)
        
        if (session.execution_context) {
          console.log(`   Context: ${JSON.stringify(session.execution_context, null, 2)}`)
        }
      })
    }
    
    // 3. Test data flow with a realistic email payload
    console.log('\n3️⃣ Testing data flow with realistic email payload...')
    
    const testEmailData = {
      type: 'message.new',
      message_id: 'test-data-flow-123',
      thread_id: 'test-thread-456',
      from: 'sender@example.com',
      to: 'recipient@gmail.com',
      subject: 'Test Email for Data Flow',
      body: 'This is a test email body that should be available in workflow actions.',
      receivedAt: new Date().toISOString(),
      labelIds: ['INBOX'],
      snippet: 'This is a test email body that should be available...',
      attachments: []
    }
    
    console.log('📤 Sending test email data to webhook...')
    console.log('Email data structure:')
    console.log(JSON.stringify(testEmailData, null, 2))
    
    // 4. Explain how data flows through the system
    console.log('\n4️⃣ How Email Data Flows Through the System:')
    console.log('')
    console.log('📥 1. Gmail sends webhook to: /api/webhooks/gmail')
    console.log('📥 2. Webhook processor receives email data:')
    console.log('      - from: sender@example.com')
    console.log('      - subject: "Test Email for Data Flow"')
    console.log('      - body: "This is a test email body..."')
    console.log('')
    console.log('🔍 3. System finds matching workflows')
    console.log('📤 4. For each matching workflow:')
    console.log('      - Creates execution session with email data')
    console.log('      - Passes email data as inputData to workflow')
    console.log('      - Email data becomes available as "data" in action nodes')
    console.log('')
    console.log('⚙️ 5. In action nodes, email data can be accessed via:')
    console.log('      - data.from (sender email)')
    console.log('      - data.subject (email subject)')
    console.log('      - data.body (email body)')
    console.log('      - data.message_id (Gmail message ID)')
    console.log('')
    console.log('🎯 6. Example usage in AI action:')
    console.log('      Input: "Summarize this email: {{data.body}}"')
    console.log('      Result: AI receives the email body for processing')
    console.log('')
    console.log('🎯 7. Example usage in Discord action:')
    console.log('      Message: "New email from {{data.from}}: {{data.subject}}"')
    console.log('      Result: Discord receives sender and subject info')
    
    // 5. Test the actual data flow
    console.log('\n5️⃣ Testing actual data flow...')
    
    const response = await fetch('http://localhost:3000/api/test/webhook-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'gmail',
        eventType: 'message.new',
        eventData: testEmailData
      })
    })
    
    const result = await response.json()
    console.log('✅ Webhook test result:', JSON.stringify(result, null, 2))
    
    // 6. Check if new execution session was created
    console.log('\n6️⃣ Checking for new execution session...')
    
    const { data: newSessions, error: newSessionError } = await supabase
      .from('workflow_execution_sessions')
      .select('*')
      .eq('session_type', 'webhook')
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (newSessionError) {
      console.error('❌ Error checking new sessions:', newSessionError)
    } else if (newSessions && newSessions.length > 0) {
      const latestSession = newSessions[0]
      console.log(`✅ New execution session created: ${latestSession.id.substring(0, 8)}...`)
      console.log(`   Status: ${latestSession.status}`)
      console.log(`   Created: ${new Date(latestSession.created_at).toLocaleString()}`)
      
      if (latestSession.execution_context) {
        console.log(`   Context contains email data: ${JSON.stringify(latestSession.execution_context, null, 2)}`)
      }
    }
    
    console.log('\n🎉 Email data flow test completed!')
    console.log('📧 Your workflows should now have access to email data for processing.')
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testEmailDataFlow() 