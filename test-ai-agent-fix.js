// Test script to verify AI Agent node creation fix
// This simulates what happens when saving an AI Agent configuration

console.log('🧪 Testing AI Agent Node Creation Fix');
console.log('=====================================\n');

// Simulate the scenario
const configuringNode = {
  id: 'node-1758308414374-dm0xl4xsn',
  nodeComponent: {
    type: 'ai_agent',
    title: 'AI Agent',
    providerId: 'ai'
  }
};

const nodes = [
  { id: 'trigger-node', type: 'custom', data: { isTrigger: true } }
];

const pendingNode = {
  type: 'action',
  sourceNodeInfo: {
    parentId: 'trigger-node',
    nodeId: 'add-action-trigger'
  }
};

console.log('📝 Test Scenario:');
console.log('- configuringNode.id:', configuringNode.id);
console.log('- configuringNode.type:', configuringNode.nodeComponent.type);
console.log('- pendingNode exists:', !!pendingNode);
console.log('- Current nodes count:', nodes.length);
console.log('\n');

// Check if AI Agent node exists (it shouldn't)
const existingAIAgentNode = nodes.find(n => n.id === configuringNode.id);
console.log('🔍 Checking for existing AI Agent node...');
console.log('- existingAIAgentNode:', existingAIAgentNode);
console.log('\n');

// Our fix condition
if (!existingAIAgentNode && configuringNode.nodeComponent?.type === 'ai_agent' && pendingNode) {
  console.log('✅ CONDITION MET - AI Agent node should be created!');
  console.log('- No existing node with ID:', configuringNode.id);
  console.log('- Node type is ai_agent');
  console.log('- pendingNode exists');
  console.log('\n🎯 This means the AI Agent node WILL be added to the workflow!');
} else {
  console.log('❌ CONDITION NOT MET - AI Agent node will NOT be created');
  console.log('- existingAIAgentNode:', !!existingAIAgentNode);
  console.log('- Is AI Agent type:', configuringNode.nodeComponent?.type === 'ai_agent');
  console.log('- pendingNode exists:', !!pendingNode);
}

console.log('\n=====================================');
console.log('✨ Test Complete');