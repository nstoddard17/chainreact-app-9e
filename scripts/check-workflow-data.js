import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkWorkflowData() {
  try {
    console.log('🔍 Checking copied workflow from template...\n');

    // Get the most recently created workflow (likely the copied one)
    const { data: workflows, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .ilike('name', '%AI Agent Test Workflow%')
      .order('created_at', { ascending: false })
      .limit(5);

    if (workflowError) {
      console.error('Error fetching workflows:', workflowError);
      return;
    }

    if (!workflows || workflows.length === 0) {
      console.error('No workflows found with AI Agent Test name');
      return;
    }

    console.log(`📋 Found ${workflows.length} workflow(s) with AI Agent Test name\n`);

    workflows.forEach((workflow, index) => {
      console.log(`\n=== Workflow ${index + 1} ===`);
      console.log('📝 ID:', workflow.id);
      console.log('📝 Name:', workflow.name);
      console.log('📅 Created:', workflow.created_at);
      console.log('👤 User ID:', workflow.user_id);
      console.log('🏢 Org ID:', workflow.organization_id || 'None');
      console.log('📊 Status:', workflow.status);

      console.log('\n📊 Data Structure:');
      console.log('- Has nodes field:', !!workflow.nodes);
      console.log('- Nodes type:', typeof workflow.nodes);
      console.log('- Nodes is array:', Array.isArray(workflow.nodes));
      console.log('- Nodes count:', workflow.nodes ? workflow.nodes.length : 0);

      console.log('- Has connections field:', !!workflow.connections);
      console.log('- Connections type:', typeof workflow.connections);
      console.log('- Connections is array:', Array.isArray(workflow.connections));
      console.log('- Connections count:', workflow.connections ? workflow.connections.length : 0);

      // Check if nodes have the expected structure
      if (workflow.nodes && workflow.nodes.length > 0) {
        console.log('\n🔹 First node structure:');
        const firstNode = workflow.nodes[0];
        console.log('  ID:', firstNode.id);
        console.log('  Type:', firstNode.type);
        console.log('  Has position:', !!firstNode.position);
        console.log('  Has data:', !!firstNode.data);
        if (firstNode.data) {
          console.log('  Data type:', firstNode.data.type);
          console.log('  Data title:', firstNode.data.title);
          console.log('  Is trigger:', firstNode.data.isTrigger);
        }

        // Count node types
        const nodeTypes = {};
        workflow.nodes.forEach(node => {
          const type = node.data?.type || node.type || 'unknown';
          nodeTypes[type] = (nodeTypes[type] || 0) + 1;
        });

        console.log('\n📊 Node Types:');
        Object.entries(nodeTypes).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
      }

      if (workflow.connections && workflow.connections.length > 0) {
        console.log('\n🔗 First connection:');
        const firstConn = workflow.connections[0];
        console.log('  ID:', firstConn.id);
        console.log('  Source:', firstConn.source);
        console.log('  Target:', firstConn.target);
      }

      // Check for potential issues
      console.log('\n⚠️ Potential Issues:');

      // Check for null or undefined in critical fields
      if (!workflow.nodes || workflow.nodes.length === 0) {
        console.log('  ❌ No nodes in workflow!');
      }

      // Check for nodes without data
      if (workflow.nodes) {
        const nodesWithoutData = workflow.nodes.filter(n => !n.data);
        if (nodesWithoutData.length > 0) {
          console.log(`  ⚠️ ${nodesWithoutData.length} nodes without data field`);
        }

        const nodesWithoutType = workflow.nodes.filter(n => !n.data?.type && !n.type);
        if (nodesWithoutType.length > 0) {
          console.log(`  ⚠️ ${nodesWithoutType.length} nodes without type`);
        }
      }

      // Check for orphaned connections
      if (workflow.nodes && workflow.connections) {
        const nodeIds = new Set(workflow.nodes.map(n => n.id));
        const orphanedConnections = workflow.connections.filter(
          c => !nodeIds.has(c.source) || !nodeIds.has(c.target)
        );
        if (orphanedConnections.length > 0) {
          console.log(`  ⚠️ ${orphanedConnections.length} connections reference non-existent nodes`);
        }
      }
    });

    console.log('\n✅ Workflow data check complete');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkWorkflowData();