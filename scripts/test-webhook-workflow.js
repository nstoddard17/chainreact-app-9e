import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestWorkflow() {
  try {
    // Create a simple test workflow with a Gmail webhook trigger
    const testWorkflow = {
      name: 'Test Gmail Webhook Workflow',
      description: 'A test workflow that triggers on new Gmail messages',
      user_id: '00000000-0000-0000-0000-000000000000', // Placeholder for testing
      status: 'active',
      nodes: [
        {
          id: 'trigger-1',
          type: 'gmail_trigger_email_received',
          position: { x: 100, y: 100 },
          data: {
            isTrigger: true,
            triggerType: 'webhook',
            triggerConfig: {
              provider: 'gmail',
              eventType: 'message.new'
            },
            label: 'Gmail New Message'
          }
        },
        {
          id: 'action-1',
          type: 'ai_action_summarize',
          position: { x: 400, y: 100 },
          data: {
            isTrigger: false,
            config: {
              input_mapping: {
                text: 'data.body',
                context: 'data.subject'
              }
            },
            label: 'Summarize Email'
          }
        }
      ],
      connections: [
        {
          id: 'conn-1',
          source: 'trigger-1',
          target: 'action-1'
        }
      ]
    }

    console.log('Creating test workflow...')
    
    // Insert the workflow with placeholder user ID
    const { data: workflow, error } = await supabase
      .from('workflows')
      .insert(testWorkflow)
      .select()
      .single()
    
    if (error) {
      console.error('❌ Error creating workflow:', error)
      return
    }
    
    console.log('✅ Test workflow created successfully!')
    console.log('📋 Workflow ID:', workflow.id)
    console.log('👤 User ID:', workflow.user_id)
    console.log('🔗 Test it with:')
    console.log(`curl -X POST http://localhost:3000/api/test/webhook-test \\`)
    console.log(`  -H "Content-Type: application/json" \\`)
    console.log(`  -d '{"provider": "gmail", "eventType": "message.new", "eventData": {"from": "test@example.com", "subject": "Test Email", "body": "This is a test email body"}}'`)
    
    return workflow
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the script
createTestWorkflow() 