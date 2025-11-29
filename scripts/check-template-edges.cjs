const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTemplateEdges() {
  const { data: templates, error } = await supabase
    .from('templates')
    .select('name, connections')
    .limit(3);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Checking template edges...\n');

  templates.forEach(template => {
    console.log(`Template: ${template.name}`);
    const edges = template.connections || template.edges || [];

    if (edges.length > 0) {
      console.log('Sample edges:');
      edges.slice(0, 3).forEach(edge => {
        console.log(`  - Type: ${edge.type || 'undefined'}, Source: ${edge.source || edge.from}, Target: ${edge.target || edge.to}`);
        if (edge.style) {
          console.log(`    Style: ${JSON.stringify(edge.style)}`);
        }
      });
    }
    console.log('');
  });
}

checkTemplateEdges();