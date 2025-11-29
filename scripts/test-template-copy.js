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

async function testTemplateCopy() {
  try {
    console.log('🚀 Testing template copy logic...\n');

    // Get the template
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('name', 'AI Agent Test Workflow - Customer Service')
      .single();

    if (error || !template) {
      console.error('Template not found:', error);
      return;
    }

    console.log('✅ Found template:', template.name);

    // Parse JSONB fields if needed
    const parseField = (field) => {
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch (e) {
          return null;
        }
      }
      return field;
    };

    const nodes = parseField(template.nodes) || [];
    const connections = parseField(template.connections) || [];

    console.log(`📊 Original: ${nodes.length} nodes, ${connections.length} connections`);

    // Separate AI Agent chain nodes from main workflow nodes
    const mainNodes = [];
    const aiAgentNodes = [];

    nodes.forEach(node => {
      if (node.data?.isAIAgentChild) {
        // This is a chain node, should not be in main workflow
        console.log(`  - Excluding chain node: ${node.id} (${node.data.title})`);
        return;
      } else if (node.data?.type === 'ai_agent') {
        // This is an AI Agent node
        aiAgentNodes.push(node);
      }
      mainNodes.push(node);
    });

    console.log(`\n📋 After separation:`);
    console.log(`  - Main nodes: ${mainNodes.length}`);
    console.log(`  - Chain nodes excluded: ${nodes.length - mainNodes.length}`);
    console.log(`  - AI Agent nodes: ${aiAgentNodes.length}`);

    // Process AI Agent nodes to populate chainsLayout with child nodes
    const processedNodes = mainNodes.map(node => {
      if (node.data?.type === 'ai_agent' && node.data?.config?.chainsLayout) {
        // Find all child nodes that belong to this AI Agent
        const childNodes = nodes.filter(n =>
          n.data?.parentAIAgentId === node.id && n.data?.isAIAgentChild
        );

        // Find all connections between child nodes
        const childNodeIds = new Set(childNodes.map(n => n.id));
        const childConnections = connections.filter(c =>
          childNodeIds.has(c.source) && childNodeIds.has(c.target)
        );

        console.log(`\n🤖 Processing AI Agent: ${node.id}`);
        console.log(`  - Found ${childNodes.length} child nodes`);
        console.log(`  - Found ${childConnections.length} child connections`);

        // Update the chainsLayout with actual nodes and edges
        return {
          ...node,
          data: {
            ...node.data,
            config: {
              ...node.data.config,
              chainsLayout: {
                ...node.data.config.chainsLayout,
                nodes: childNodes.map(cn => ({
                  id: cn.id,
                  type: cn.type || 'custom',
                  position: cn.position,
                  data: cn.data
                })),
                edges: childConnections.map(ce => ({
                  id: ce.id,
                  source: ce.source,
                  target: ce.target
                }))
              }
            }
          }
        };
      }
      return node;
    });

    // Filter connections to only include those between main nodes
    const mainNodeIds = new Set(mainNodes.map(n => n.id));
    const mainConnections = connections.filter(c =>
      mainNodeIds.has(c.source) && mainNodeIds.has(c.target)
    );

    console.log(`\n📊 Final structure for workflow:`);
    console.log(`  - Nodes to save: ${processedNodes.length}`);
    console.log(`  - Connections to save: ${mainConnections.length}`);

    // Show the AI Agent chainsLayout content
    const aiAgentNode = processedNodes.find(n => n.data?.type === 'ai_agent');
    if (aiAgentNode) {
      const chainsLayout = aiAgentNode.data.config.chainsLayout;
      console.log(`\n🔗 AI Agent chainsLayout:`);
      console.log(`  - Chains defined: ${chainsLayout.chains?.length || 0}`);
      console.log(`  - Nodes in layout: ${chainsLayout.nodes?.length || 0}`);
      console.log(`  - Edges in layout: ${chainsLayout.edges?.length || 0}`);

      if (chainsLayout.nodes && chainsLayout.nodes.length > 0) {
        console.log(`\n  Chain nodes in layout:`);
        chainsLayout.nodes.forEach(n => {
          console.log(`    - ${n.id}: ${n.data?.title || n.data?.type}`);
        });
      }
    }

    console.log('\n✅ Template processing test complete!');
    console.log('\nThe workflow would be created with:');
    console.log('- 2 main nodes (Discord trigger + AI Agent)');
    console.log('- 1 connection between them');
    console.log('- AI Agent contains 6 chain nodes in its chainsLayout');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testTemplateCopy();