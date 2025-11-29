const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixTemplateEdgeTypes() {
  try {
    console.log('🔧 Fixing Template Edge Types for Rounded Corners\n');
    console.log('=' .repeat(80));

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log(`\n📊 Found ${templates.length} templates to update\n`);

    let successCount = 0;

    for (const template of templates) {
      console.log(`\n📋 ${template.name}`);

      const edges = template.connections || [];

      if (edges.length === 0) {
        console.log('   No edges to update');
        continue;
      }

      console.log(`   Updating ${edges.length} edges...`);

      // Update each edge to have proper type and styling
      const updatedEdges = edges.map(edge => {
        // Determine if edge should be dashed (for connections to add action nodes)
        const targetNode = (template.nodes || []).find(n => n.id === (edge.target || edge.to));
        const isDashed = targetNode?.type === 'addAction' || targetNode?.id?.includes('add-action');

        return {
          ...edge,
          id: edge.id || `e-${edge.source || edge.from}-${edge.target || edge.to}`,
          source: edge.source || edge.from,
          target: edge.target || edge.to,
          type: 'custom', // Use custom type for rounded edges
          animated: false,
          style: {
            stroke: '#9ca3af',
            strokeWidth: isDashed ? 1.5 : 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            ...(isDashed && { strokeDasharray: '5 5' })
          }
        };
      });

      // Update the template
      const { error: updateError } = await supabase
        .from('templates')
        .update({
          connections: updatedEdges,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (updateError) {
        console.error(`   ❌ Error updating template: ${updateError.message}`);
      } else {
        console.log(`   ✅ Successfully updated edge types`);
        successCount++;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n✨ Edge Type Update Complete!');
    console.log(`   ✅ Updated: ${successCount}/${templates.length} templates`);
    console.log('   📐 All edges now use rounded corners');
    console.log('   🎨 Consistent styling applied\n');

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

fixTemplateEdgeTypes();