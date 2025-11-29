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

async function verifyNodeTypes() {
  try {
    console.log('🔍 Verifying node types in template...\n');

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
    console.log('📊 Checking node types:\n');

    // Check all nodes
    if (template.nodes && Array.isArray(template.nodes)) {
      template.nodes.forEach((node, index) => {
        console.log(`Node ${index + 1}:`);
        console.log(`  ID: ${node.id}`);
        console.log(`  Type: ${node.type} ${node.type === 'custom' ? '✅' : '❌ Should be "custom"'}`);
        console.log(`  Data.type: ${node.data?.type}`);
        console.log(`  Title: ${node.data?.title}`);
        console.log('');
      });
    }

    // Count node types
    const nodeTypeCounts = {};
    template.nodes.forEach(node => {
      nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
    });

    console.log('📊 Node Type Summary:');
    Object.entries(nodeTypeCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} nodes`);
    });

    if (nodeTypeCounts.custom === template.nodes.length) {
      console.log('\n✅ All nodes have type: "custom" - Perfect!');
    } else {
      console.log('\n❌ Some nodes have incorrect type - need fixing!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyNodeTypes();