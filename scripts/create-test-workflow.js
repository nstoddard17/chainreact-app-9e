import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTestWorkflow() {
  try {
    console.log('🔧 Creating test workflow with Gmail webhook trigger...')

    // Create a test workflow with a Gmail webhook trigger
    const testWorkflow = {
      name: 'Test Gmail Webhook Workflow',
      description: 'A test workflow that triggers on new Gmail messages',
      user_id: '00000000-0000-0000-0000-000000000000', // You'll need to replace with actual user ID
      status: 'active',
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
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
          type: 'action',
          position: { x: 400, y: 100 },
          data: {
            actionType: 'log',
            label: 'Log Message',
            config: {
              message: 'New Gmail message received: {{inputData.subject}}'
            }
          }
        }
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1'
        }
      ]
    }

    // Insert the test workflow
    const { data: workflow, error } = await supabase
      .from('workflows')
      .insert(testWorkflow)
      .select()
      .single()

    if (error) {
      console.error('❌ Failed to create test workflow:', error)
      return
    }

    console.log('✅ Test workflow created successfully!')
    console.log('📋 Workflow ID:', workflow.id)
    console.log('📋 Workflow Name:', workflow.name)
    console.log('')
    console.log('🧪 To test this workflow:')
    console.log('1. Replace the user_id in this script with your actual user ID')
    console.log('2. Run: node scripts/create-test-workflow.js')
    console.log('3. Test with: curl -X POST http://localhost:3000/api/test/webhook-test \\')
    console.log('   -H "Content-Type: application/json" \\')
    console.log('   -d \'{"provider":"gmail","eventType":"message.new"}\'')

  } catch (error) {
    console.error('❌ Error creating test workflow:', error)
  }
}

// Get user ID from command line argument or prompt
async function main() {
  const userId = process.argv[2]
  
  if (!userId) {
    console.log('❌ Please provide a user ID as an argument:')
    console.log('   node scripts/create-test-workflow.js YOUR_USER_ID')
    console.log('')
    console.log('💡 To find your user ID:')
    console.log('   1. Go to your Supabase dashboard')
    console.log('   2. Navigate to Authentication > Users')
    console.log('   3. Copy your user ID')
    return
  }

  // Update the script with the provided user ID
  const scriptContent = require('fs').readFileSync(__filename, 'utf8')
  const updatedScript = scriptContent.replace(
    /user_id: '00000000-0000-0000-0000-000000000000'/,
    `user_id: '${userId}'`
  )
  require('fs').writeFileSync(__filename, updatedScript)

  await createTestWorkflow()
}

main() 