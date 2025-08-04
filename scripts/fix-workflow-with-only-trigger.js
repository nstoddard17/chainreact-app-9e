import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixWorkflowWithOnlyTrigger() {
  try {
    console.log('🔧 Fixing workflow with only trigger...\n')
    
    // Find the workflow that only has a trigger
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('id, name, status, nodes, connections')
      .eq('name', 'test')
    
    if (error) {
      console.error('❌ Error fetching workflow:', error)
      return
    }
    
    if (!workflows || workflows.length === 0) {
      console.log('❌ Workflow "test" not found')
      return
    }
    
    const workflow = workflows[0]
    console.log(`🔗 Found workflow: "${workflow.name}" (ID: ${workflow.id})`)
    console.log(`   Status: ${workflow.status}`)
    console.log(`   Nodes: ${workflow.nodes?.length || 0}`)
    console.log(`   Connections: ${workflow.connections?.length || 0}`)
    
    const triggerNodes = workflow.nodes?.filter(node => node.data?.isTrigger) || []
    const actionNodes = workflow.nodes?.filter(node => !node.data?.isTrigger) || []
    
    console.log(`   Trigger nodes: ${triggerNodes.length}`)
    console.log(`   Action nodes: ${actionNodes.length}`)
    
    if (actionNodes.length === 0) {
      console.log('\n⚠️  This workflow only has a trigger but no actions!')
      console.log('   This is why it might show issues in the UI.')
      
      // Option 1: Add a simple action node
      console.log('\n🔧 Option 1: Add a simple action node')
      console.log('   This would make the workflow complete.')
      
      // Option 2: Set status to draft
      console.log('\n🔧 Option 2: Set status to draft')
      console.log('   This would prevent activation until actions are added.')
      
      // Option 3: Delete the workflow
      console.log('\n🔧 Option 3: Delete the workflow')
      console.log('   This would remove the incomplete workflow.')
      
      console.log('\n📝 What would you like to do?')
      console.log('   1. Add a simple action node')
      console.log('   2. Set status to draft')
      console.log('   3. Delete the workflow')
      console.log('   4. Do nothing')
      
      // For now, let's set it to draft status
      console.log('\n🔄 Setting workflow status to draft...')
      
      const { error: updateError } = await supabase
        .from('workflows')
        .update({ status: 'draft' })
        .eq('id', workflow.id)
      
      if (updateError) {
        console.error('❌ Error updating workflow status:', updateError)
      } else {
        console.log('✅ Successfully set workflow status to draft')
        console.log('   Now the UI will show it needs actions instead of being active')
      }
    } else {
      console.log('✅ This workflow has both trigger and actions - it should be fine!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the fix
fixWorkflowWithOnlyTrigger() 