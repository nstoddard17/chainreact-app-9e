import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAIAgentNode() {
  try {
    console.log('🔍 Checking AI Agent node in copied workflow...\n');

    // Get the copied workflow
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', '4cd6befa-e2f8-461b-9ca7-f8c6382620a2')
      .single();

    if (error) {
      console.error('Error fetching workflow:', error);
      return;
    }

    if (!workflow) {
      console.error('Workflow not found');
      return;
    }

    console.log('📋 Workflow:', workflow.name);
    console.log('📊 Total nodes:', workflow.nodes.length);
    console.log('🔗 Total connections:', workflow.connections.length);

    // Find the AI Agent node
    const aiAgentNode = workflow.nodes.find(n => n.data?.type === 'ai_agent');

    if (!aiAgentNode) {
      console.error('AI Agent node not found');
      return;
    }

    console.log('\n🤖 AI Agent Node:');
    console.log('ID:', aiAgentNode.id);
    console.log('Type:', aiAgentNode.type);
    console.log('Position:', JSON.stringify(aiAgentNode.position));

    console.log('\n📦 AI Agent Data:');
    console.log('- Type:', aiAgentNode.data.type);
    console.log('- Title:', aiAgentNode.data.title);

    if (aiAgentNode.data.config) {
      console.log('\n⚙️ Config:');
      console.log('- Model:', aiAgentNode.data.config.model);
      console.log('- Temperature:', aiAgentNode.data.config.temperature);
      console.log('- Auto Select Chain:', aiAgentNode.data.config.autoSelectChain);
      console.log('- Parallel Execution:', aiAgentNode.data.config.parallelExecution);
      console.log('- Prompt:', aiAgentNode.data.config.prompt?.substring(0, 50) + '...');

      if (aiAgentNode.data.config.chainsLayout) {
        const chainsLayout = aiAgentNode.data.config.chainsLayout;
        console.log('\n🔗 Chains Layout:');
        console.log('- Has chains:', !!chainsLayout.chains);
        console.log('- Chains count:', chainsLayout.chains?.length || 0);
        console.log('- Has nodes:', !!chainsLayout.nodes);
        console.log('- Nodes count:', chainsLayout.nodes?.length || 0);
        console.log('- Has edges:', !!chainsLayout.edges);
        console.log('- Edges count:', chainsLayout.edges?.length || 0);

        if (chainsLayout.chains && chainsLayout.chains.length > 0) {
          console.log('\n📌 Chain Definitions:');
          chainsLayout.chains.forEach((chain, index) => {
            console.log(`\n  Chain ${index + 1}:`);
            console.log(`    ID: ${chain.id}`);
            console.log(`    Name: ${chain.name}`);
            console.log(`    Description: ${chain.description}`);
            console.log(`    Conditions: ${chain.conditions?.length || 0} condition(s)`);
            if (chain.conditions && chain.conditions.length > 0) {
              chain.conditions.forEach((cond, i) => {
                console.log(`      ${i + 1}. ${cond.field} ${cond.operator} "${cond.value}"`);
              });
            }
          });
        }
      }
    }

    // Find child nodes (nodes that belong to AI Agent chains)
    const childNodes = workflow.nodes.filter(n =>
      n.data?.parentAIAgentId === aiAgentNode.id ||
      n.data?.isAIAgentChild
    );

    console.log('\n👶 Child Nodes (Chain Actions):');
    console.log(`Found ${childNodes.length} child node(s)`);

    if (childNodes.length > 0) {
      childNodes.forEach(child => {
        console.log(`\n  ${child.id}:`);
        console.log(`    Type: ${child.data?.type}`);
        console.log(`    Title: ${child.data?.title}`);
        console.log(`    Parent Chain Index: ${child.data?.parentChainIndex}`);
        console.log(`    Is AI Agent Child: ${child.data?.isAIAgentChild}`);
      });
    }

    // Check connections from AI Agent
    const connectionsFromAI = workflow.connections.filter(c => c.source === aiAgentNode.id);
    const connectionsToAI = workflow.connections.filter(c => c.target === aiAgentNode.id);

    console.log('\n🔌 Connections:');
    console.log(`- Incoming: ${connectionsToAI.length}`);
    connectionsToAI.forEach(c => {
      const sourceNode = workflow.nodes.find(n => n.id === c.source);
      console.log(`    ${c.source} (${sourceNode?.data?.type}) → AI Agent`);
    });

    console.log(`- Outgoing: ${connectionsFromAI.length}`);
    connectionsFromAI.forEach(c => {
      const targetNode = workflow.nodes.find(n => n.id === c.target);
      console.log(`    AI Agent → ${c.target} (${targetNode?.data?.type})`);
    });

    console.log('\n✅ AI Agent node check complete');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAIAgentNode();