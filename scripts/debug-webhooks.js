import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugWebhooks() {
  try {
    console.log('🔍 Debugging webhook workflow matching...\n')
    
    // 1. Get ALL workflows (not just active)
    const { data: allWorkflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, user_id')
    
    if (workflowsError) {
      console.error('❌ Error fetching workflows:', workflowsError)
      return
    }
    
    console.log(`📋 Found ${allWorkflows?.length || 0} total workflows:\n`)
    
    if (!allWorkflows || allWorkflows.length === 0) {
      console.log('❌ No workflows found at all!')
      return
    }
    
    // 2. Analyze each workflow
    allWorkflows.forEach((workflow, index) => {
      console.log(`${index + 1}. Workflow: "${workflow.name}" (ID: ${workflow.id})`)
      console.log(`   User ID: ${workflow.user_id}`)
      console.log(`   Status: ${workflow.status}`)
      
      if (workflow.nodes && workflow.nodes.length > 0) {
        console.log(`   Nodes (${workflow.nodes.length}):`)
        workflow.nodes.forEach((node, nodeIndex) => {
          console.log(`     ${nodeIndex + 1}. ${node.type || 'unknown'} - ${node.data?.label || 'no label'}`)
          console.log(`        isTrigger: ${node.data?.isTrigger}`)
          console.log(`        triggerType: ${node.data?.triggerType}`)
          if (node.data?.triggerConfig) {
            console.log(`        triggerConfig:`, JSON.stringify(node.data.triggerConfig, null, 8))
          }
        })
      } else {
        console.log(`   ❌ No nodes found!`)
      }
      console.log('')
    })
    
    // 3. Check for webhook triggers specifically
    console.log('🔗 Looking for webhook triggers...\n')
    
    const webhookWorkflows = allWorkflows?.filter(workflow => {
      return workflow.nodes?.some(node => 
        node.data?.isTrigger && 
        node.data?.triggerType === 'webhook'
      )
    }) || []
    
    console.log(`Found ${webhookWorkflows.length} workflows with webhook triggers:`)
    
    webhookWorkflows.forEach(workflow => {
      console.log(`\n📋 "${workflow.name}" (Status: ${workflow.status})`)
      
      const webhookNodes = workflow.nodes.filter(node => 
        node.data?.isTrigger && 
        node.data?.triggerType === 'webhook'
      )
      
      webhookNodes.forEach(node => {
        console.log(`   🔗 ${node.data.triggerConfig?.provider} - ${node.data.triggerConfig?.eventType}`)
        console.log(`      Config:`, JSON.stringify(node.data.triggerConfig, null, 6))
      })
    })
    
    // 4. Test webhook matching logic
    console.log('\n🧪 Testing webhook matching logic...\n')
    
    const testEvent = {
      provider: 'gmail',
      eventType: 'message.new',
      eventData: {
        from: 'test@example.com',
        subject: 'Test Email',
        body: 'Test body'
      }
    }
    
    console.log(`Testing event: ${testEvent.provider} - ${testEvent.eventType}`)
    
    const matchingWorkflows = allWorkflows?.filter(workflow => {
      if (!workflow.nodes) return false
      
      const triggerNode = workflow.nodes.find((node) => 
        node.data?.isTrigger && 
        node.data?.triggerType === 'webhook' &&
        node.data?.triggerConfig?.provider === testEvent.provider &&
        node.data?.triggerConfig?.eventType === testEvent.eventType
      )
      
      if (triggerNode) {
        console.log(`✅ Found matching trigger in workflow "${workflow.name}" (Status: ${workflow.status})`)
        console.log(`   Trigger config:`, JSON.stringify(triggerNode.data.triggerConfig, null, 6))
        return true
      }
      
      return false
    }) || []
    
    console.log(`\n🎯 Found ${matchingWorkflows.length} matching workflows for the test event`)
    
    // 5. Check why workflows might not be active
    console.log('\n🔍 Checking workflow statuses...')
    const statusCounts = {}
    allWorkflows?.forEach(workflow => {
      statusCounts[workflow.status] = (statusCounts[workflow.status] || 0) + 1
    })
    
    console.log('Workflow status distribution:')
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the debug script
debugWebhooks() 