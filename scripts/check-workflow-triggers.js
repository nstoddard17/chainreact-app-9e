import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkWorkflowTriggers() {
  try {
    console.log('🔍 Checking workflow trigger configurations...\n')
    
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, connections')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('❌ Error fetching workflows:', error)
      return
    }
    
    console.log(`📊 Found ${workflows?.length || 0} workflows:\n`)
    
    workflows?.forEach(workflow => {
      console.log(`🔗 Workflow: "${workflow.name}" (ID: ${workflow.id})`)
      console.log(`   Status: ${workflow.status}`)
      console.log(`   Nodes: ${workflow.nodes?.length || 0}`)
      console.log(`   Connections: ${workflow.connections?.length || 0}`)
      
      // Check for trigger nodes
      const triggerNodes = workflow.nodes?.filter(node => node.data?.isTrigger) || []
      const actionNodes = workflow.nodes?.filter(node => !node.data?.isTrigger) || []
      
      console.log(`   Trigger nodes: ${triggerNodes.length}`)
      console.log(`   Action nodes: ${actionNodes.length}`)
      
      if (triggerNodes.length > 0) {
        triggerNodes.forEach((node, index) => {
          console.log(`      Trigger ${index + 1}: ${node.type}`)
          console.log(`         isTrigger: ${node.data?.isTrigger}`)
          console.log(`         triggerType: ${node.data?.triggerType}`)
          console.log(`         triggerConfig: ${JSON.stringify(node.data?.triggerConfig, null, 2)}`)
        })
      }
      
      // Check what the UI would show
      const hasTrigger = workflow.nodes?.some(n => n.data?.isTrigger)
      const hasAction = workflow.nodes?.some(n => !n.data?.isTrigger)
      const hasConnections = workflow.connections?.length > 0
      
      console.log(`   UI Status Check:`)
      console.log(`      Has trigger: ${hasTrigger}`)
      console.log(`      Has action: ${hasAction}`)
      console.log(`      Has connections: ${hasConnections}`)
      
      if (workflow.status === 'draft') {
        if (!hasTrigger) {
          console.log(`      ❌ Would show: "Missing trigger"`)
        }
        if (hasTrigger && !hasAction) {
          console.log(`      ❌ Would show: "Missing action"`)
        }
        if (workflow.nodes?.length > 1 && !hasConnections) {
          console.log(`      ❌ Would show: "Missing connections"`)
        }
      }
      
      console.log('')
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the check
checkWorkflowTriggers() 