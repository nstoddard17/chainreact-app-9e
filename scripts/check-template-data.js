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

async function checkTemplate() {
  try {
    console.log('🔍 Checking AI Agent template in database...\n');

    // Get the template
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('name', 'AI Agent Test Workflow - Customer Service')
      .single();

    if (error) {
      console.error('Error fetching template:', error);
      return;
    }

    if (!template) {
      console.error('Template not found');
      return;
    }

    console.log('📋 Template found with ID:', template.id);
    console.log('📝 Name:', template.name);
    console.log('🏷️ Category:', template.category);
    console.log('📌 Is Predefined:', template.is_predefined);
    console.log('🌍 Is Public:', template.is_public);

    console.log('\n📊 Data Structure:');
    console.log('- Has nodes field:', !!template.nodes);
    console.log('- Nodes is array:', Array.isArray(template.nodes));
    console.log('- Nodes length:', template.nodes ? template.nodes.length : 0);
    console.log('- Has connections field:', !!template.connections);
    console.log('- Connections is array:', Array.isArray(template.connections));
    console.log('- Connections length:', template.connections ? template.connections.length : 0);
    console.log('- Has workflow_json:', !!template.workflow_json);

    if (template.nodes && template.nodes.length > 0) {
      console.log('\n🔹 First node:');
      const firstNode = template.nodes[0];
      console.log('  ID:', firstNode.id);
      console.log('  Type:', firstNode.type);
      console.log('  Has data:', !!firstNode.data);
      console.log('  Data type:', firstNode.data?.type);
      console.log('  Title:', firstNode.data?.title);
    }

    if (template.workflow_json) {
      console.log('\n📦 Workflow JSON structure:');
      console.log('- Has nodes:', !!template.workflow_json.nodes);
      console.log('- Nodes length:', template.workflow_json.nodes?.length || 0);
      console.log('- Has edges:', !!template.workflow_json.edges);
      console.log('- Edges length:', template.workflow_json.edges?.length || 0);
    }

    console.log('\n✅ Template check complete');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTemplate();