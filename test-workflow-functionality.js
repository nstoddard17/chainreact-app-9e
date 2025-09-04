// Test script to verify AI workflow generator functionality
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testWorkflowFunctionality() {
  try {
    console.log('🧪 Testing AI Workflow Generator Functionality...\n');
    
    // Find the most recent AI-generated workflow
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('*')
      .like('name', '%Customer Support%')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('Error fetching workflow:', error);
      return;
    }
    
    if (!workflows || workflows.length === 0) {
      console.log('No customer support workflow found');
      return;
    }
    
    const workflow = workflows[0];
    console.log('✅ Found workflow:', workflow.name);
    console.log('   ID:', workflow.id);
    console.log('   Description:', workflow.description);
    console.log('   Status:', workflow.status);
    console.log('   Created:', new Date(workflow.created_at).toLocaleString());
    console.log('\n📊 Workflow Structure Analysis:');
    
    // Analyze nodes
    const nodes = workflow.nodes || [];
    console.log(`   Total nodes: ${nodes.length}`);
    
    // Count node types
    const nodeTypes = {};
    const aiAgentNodes = [];
    const actionNodes = [];
    const triggerNodes = [];
    const addActionNodes = [];
    
    nodes.forEach(node => {
      const type = node.data?.type || node.type || 'unknown';
      nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      
      if (type === 'ai_agent') {
        aiAgentNodes.push(node);
      } else if (node.data?.isTrigger) {
        triggerNodes.push(node);
      } else if (type === 'addAction') {
        addActionNodes.push(node);
      } else if (node.data?.type && node.data.type.includes('action')) {
        actionNodes.push(node);
      }
    });
    
    console.log('\n📌 Node Type Breakdown:');
    Object.entries(nodeTypes).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
    
    // Analyze AI Agent configuration
    if (aiAgentNodes.length > 0) {
      console.log('\n🤖 AI Agent Analysis:');
      aiAgentNodes.forEach(agent => {
        const config = agent.data?.config || {};
        console.log(`   Agent ID: ${agent.id}`);
        console.log(`   Model: ${config.model || 'not specified'}`);
        console.log(`   Chains in config: ${config.chains ? config.chains.length : 0}`);
        
        if (config.chains && config.chains.length > 0) {
          console.log('\n   📋 Chain Details:');
          config.chains.forEach((chain, index) => {
            console.log(`      Chain ${index + 1}: ${chain.name || 'Unnamed'}`);
            console.log(`         - Description: ${chain.description || 'None'}`);
            console.log(`         - Actions: ${chain.actions ? chain.actions.length : 0}`);
            if (chain.actions) {
              chain.actions.forEach(action => {
                console.log(`           • ${action.label || action.type} (${action.providerId})`);
              });
            }
          });
        }
      });
    }
    
    // Check visual nodes for chains
    console.log('\n🔗 Visual Chain Nodes:');
    const chainNodes = nodes.filter(n => 
      n.id.includes('-chain') && n.id.includes('-action')
    );
    console.log(`   Chain action nodes found: ${chainNodes.length}`);
    
    // Group by chain
    const chainGroups = {};
    chainNodes.forEach(node => {
      const match = node.id.match(/chain(\d+)/);
      if (match) {
        const chainNum = match[1];
        if (!chainGroups[chainNum]) {
          chainGroups[chainNum] = [];
        }
        chainGroups[chainNum].push(node);
      }
    });
    
    Object.entries(chainGroups).forEach(([chainNum, nodes]) => {
      console.log(`   Chain ${chainNum}: ${nodes.length} action nodes`);
      nodes.forEach(node => {
        console.log(`      - ${node.data?.title || node.data?.label || 'Unnamed'}`);
      });
    });
    
    // Check connections
    console.log('\n🔌 Connections Analysis:');
    const connections = workflow.connections || [];
    console.log(`   Total connections: ${connections.length}`);
    
    // Verify chain connections
    const aiAgentConnections = connections.filter(c => 
      c.source.includes('node-') && c.target.includes('-chain')
    );
    console.log(`   AI Agent to chain connections: ${aiAgentConnections.length}`);
    
    // Test result
    console.log('\n🎯 Test Results:');
    const hasAIAgent = aiAgentNodes.length > 0;
    const hasChains = aiAgentNodes.some(a => a.data?.config?.chains?.length > 0);
    const hasVisualNodes = chainNodes.length > 0;
    const hasConnections = connections.length > 0;
    
    console.log(`   ✅ AI Agent node exists: ${hasAIAgent ? 'YES' : 'NO'}`);
    console.log(`   ✅ Chains in AI Agent config: ${hasChains ? 'YES' : 'NO'}`);
    console.log(`   ✅ Visual chain nodes created: ${hasVisualNodes ? 'YES' : 'NO'}`);
    console.log(`   ✅ Connections between nodes: ${hasConnections ? 'YES' : 'NO'}`);
    
    if (hasAIAgent && hasChains && hasVisualNodes && hasConnections) {
      console.log('\n✨ SUCCESS: AI Workflow Generator is working correctly!');
      console.log('   The workflow has both configuration chains and visual nodes.');
    } else {
      console.log('\n⚠️  PARTIAL SUCCESS: Some features may need attention.');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testWorkflowFunctionality();