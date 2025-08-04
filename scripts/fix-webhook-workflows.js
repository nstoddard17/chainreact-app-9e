import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixWebhookWorkflows() {
  try {
    console.log('🔧 Fixing webhook workflow configurations...\n')
    
    // 1. Get all workflows
    const { data: allWorkflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, user_id')
    
    if (workflowsError) {
      console.error('❌ Error fetching workflows:', workflowsError)
      return
    }
    
    console.log(`📋 Found ${allWorkflows?.length || 0} workflows\n`)
    
    if (!allWorkflows || allWorkflows.length === 0) {
      console.log('❌ No workflows found!')
      return
    }
    
    // 2. Fix each workflow
    for (const workflow of allWorkflows) {
      console.log(`🔧 Fixing workflow: "${workflow.name}" (ID: ${workflow.id})`)
      console.log(`   Current status: ${workflow.status}`)
      
      let needsUpdate = false
      const updatedNodes = workflow.nodes?.map(node => {
        // Check if this is a trigger node that needs fixing
        if (node.data?.isTrigger) {
          console.log(`   🔗 Fixing trigger node: ${node.type}`)
          
          // Determine the correct trigger configuration based on workflow name and node type
          let triggerConfig = {}
          let updatedType = node.type
          
          // Check if this is a Gmail-related workflow
          if (workflow.name.toLowerCase().includes('email') || 
              workflow.name.toLowerCase().includes('gmail') ||
              node.data?.label?.toLowerCase().includes('email')) {
            triggerConfig = {
              provider: 'gmail',
              eventType: 'message.new'
            }
            updatedType = 'gmail_trigger_new_email'
          } else if (node.type.includes('discord') || 
                     workflow.name.toLowerCase().includes('discord')) {
            triggerConfig = {
              provider: 'discord',
              eventType: 'MESSAGE_CREATE'
            }
            updatedType = 'discord_trigger_message'
          } else if (node.type.includes('slack') || 
                     workflow.name.toLowerCase().includes('slack')) {
            triggerConfig = {
              provider: 'slack',
              eventType: 'message'
            }
            updatedType = 'slack_trigger_message'
          } else {
            // Default webhook configuration
            triggerConfig = {
              provider: 'gmail',
              eventType: 'message.new'
            }
            updatedType = 'gmail_trigger_new_email'
          }
          
          const updatedNode = {
            ...node,
            type: updatedType,
            data: {
              ...node.data,
              triggerType: 'webhook',
              triggerConfig: triggerConfig
            }
          }
          
          console.log(`   ✅ Updated to: ${updatedType}`)
          console.log(`   ✅ Trigger config:`, JSON.stringify(triggerConfig, null, 6))
          needsUpdate = true
          return updatedNode
        }
        
        return node
      }) || []
      
      // 3. Update the workflow if needed
      if (needsUpdate) {
        const updateData = {
          nodes: updatedNodes,
          status: 'active' // Activate the workflow
        }
        
        const { error: updateError } = await supabase
          .from('workflows')
          .update(updateData)
          .eq('id', workflow.id)
        
        if (updateError) {
          console.error(`   ❌ Error updating workflow:`, updateError)
        } else {
          console.log(`   ✅ Workflow updated and activated successfully!`)
        }
      } else {
        console.log(`   ℹ️  No changes needed for this workflow`)
      }
      
      console.log('')
    }
    
    // 4. Test the fixed workflows
    console.log('🧪 Testing fixed workflows...\n')
    
    const testEvent = {
      provider: 'gmail',
      eventType: 'message.new',
      eventData: {
        from: 'test@example.com',
        subject: 'Test Email',
        body: 'This is a test email body'
      }
    }
    
    console.log(`Testing event: ${testEvent.provider} - ${testEvent.eventType}`)
    
    // Get updated workflows
    const { data: updatedWorkflows } = await supabase
      .from('workflows')
      .select('id, name, status, nodes')
      .eq('status', 'active')
    
    const matchingWorkflows = updatedWorkflows?.filter(workflow => {
      if (!workflow.nodes) return false
      
      const triggerNode = workflow.nodes.find((node) => 
        node.data?.isTrigger && 
        node.data?.triggerType === 'webhook' &&
        node.data?.triggerConfig?.provider === testEvent.provider &&
        node.data?.triggerConfig?.eventType === testEvent.eventType
      )
      
      if (triggerNode) {
        console.log(`✅ Found matching trigger in workflow "${workflow.name}"`)
        console.log(`   Trigger config:`, JSON.stringify(triggerNode.data.triggerConfig, null, 6))
        return true
      }
      
      return false
    }) || []
    
    console.log(`\n🎯 Found ${matchingWorkflows.length} matching workflows for the test event`)
    
    if (matchingWorkflows.length > 0) {
      console.log('\n🔗 Test the webhook now with:')
      console.log(`curl -X POST http://localhost:3000/api/test/webhook-test \\`)
      console.log(`  -H "Content-Type: application/json" \\`)
      console.log(`  -d '{"provider": "gmail", "eventType": "message.new", "eventData": {"from": "test@example.com", "subject": "Test Email", "body": "This is a test email body"}}'`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the fix script
fixWebhookWorkflows() 