const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testWorkflowExecution() {
  try {
    console.log('🔍 Testing workflow execution...')
    
    // Get a user through the profiles table
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .limit(1)
    
    if (profileError || !profiles || profiles.length === 0) {
      console.error('❌ No users found in profiles table')
      return
    }
    
    const user = profiles[0]
    console.log('👤 Using user:', user.email)
    
    // Get Google Drive integration for this user
    const { data: integrations, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google-drive')
      .eq('status', 'connected')
      .limit(1)
    
    if (integrationError || !integrations || integrations.length === 0) {
      console.error('❌ No Google Drive integration found for user')
      return
    }
    
    const integration = integrations[0]
    console.log('✅ Found Google Drive integration:', integration.id)
    
    // Create a test workflow with Google Drive create file node
    const testWorkflow = {
      name: 'Test Google Drive Workflow',
      description: 'Test workflow for Google Drive file creation',
      user_id: user.id,
      status: 'draft',
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'manual',
            title: 'Manual Trigger',
            description: 'Manual trigger for testing',
            isTrigger: true,
            config: {}
          }
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 400, y: 100 },
          data: {
            type: 'google-drive:create_file',
            title: 'Create File',
            description: 'Create a test file in Google Drive',
            providerId: 'google-drive',
            isTrigger: false,
            config: {
              fileName: `test-file-${Date.now()}.txt`,
              fileContent: 'This is a test file created by ChainReact workflow execution test',
              folderId: undefined // Upload to root
            }
          }
        }
      ],
      connections: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1',
          sourceHandle: null,
          targetHandle: null
        }
      ]
    }
    
    // Create the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .insert(testWorkflow)
      .select()
      .single()
    
    if (workflowError) {
      console.error('❌ Error creating test workflow:', workflowError)
      return
    }
    
    console.log('✅ Created test workflow:', workflow.id)
    
    // Test the execution API
    console.log('🚀 Testing workflow execution...')
    
    const response = await fetch('http://localhost:3000/api/workflows/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflowId: workflow.id,
        testMode: false, // Set to true to test without creating actual files
        inputData: {},
        workflowData: {
          id: workflow.id,
          nodes: testWorkflow.nodes,
          connections: testWorkflow.connections
        }
      })
    })
    
    console.log('📥 Response status:', response.status)
    
    const result = await response.json()
    console.log('📥 Response body:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('✅ Workflow execution successful!')
    } else {
      console.error('❌ Workflow execution failed:', result.error)
    }
    
    // Clean up - delete the test workflow
    await supabase.from('workflows').delete().eq('id', workflow.id)
    console.log('🧹 Cleaned up test workflow')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testWorkflowExecution() 