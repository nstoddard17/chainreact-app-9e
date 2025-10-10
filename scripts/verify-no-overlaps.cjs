const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MIN_SAFE_DISTANCE = {
  horizontal: 400,  // Minimum horizontal distance between nodes
  vertical: 150     // Minimum vertical distance between nodes
};

async function verifyTemplates() {
  try {
    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log('🔍 Verifying Node Positions (No Overlaps Check)\n');
    console.log('=' .repeat(80));

    let totalIssues = 0;
    let templatesWithIssues = 0;

    for (const template of templates) {
      const nodes = template.nodes || [];
      let templateIssues = [];

      // Check each pair of nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];

          if (!node1.position || !node2.position) continue;

          const dx = Math.abs(node1.position.x - node2.position.x);
          const dy = Math.abs(node1.position.y - node2.position.y);

          // Check for nodes that are too close (potential overlap)
          if (dx < MIN_SAFE_DISTANCE.horizontal && dy < MIN_SAFE_DISTANCE.vertical) {
            const title1 = node1.data?.title || node1.id;
            const title2 = node2.data?.title || node2.id;
            templateIssues.push({
              nodes: [title1, title2],
              distance: { x: dx, y: dy },
              positions: {
                node1: `(${node1.position.x}, ${node1.position.y})`,
                node2: `(${node2.position.x}, ${node2.position.y})`
              }
            });
          }
        }
      }

      // Report results for this template
      if (templateIssues.length > 0) {
        console.log(`\n❌ ${template.name}`);
        console.log(`   ${templateIssues.length} overlap issues found:`);

        templateIssues.forEach(issue => {
          console.log(`   - "${issue.nodes[0]}" and "${issue.nodes[1]}"`);
          console.log(`     Distance: x=${issue.distance.x}px, y=${issue.distance.y}px`);
          console.log(`     Positions: ${issue.positions.node1} vs ${issue.positions.node2}`);
        });

        totalIssues += templateIssues.length;
        templatesWithIssues++;
      } else {
        console.log(`\n✅ ${template.name} - No overlaps detected`);
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n📊 Summary:');

    if (totalIssues === 0) {
      console.log('   🎉 All templates are properly spaced with no overlaps!');
    } else {
      console.log(`   ⚠️  Found ${totalIssues} overlap issues in ${templatesWithIssues}/${templates.length} templates`);
      console.log(`   Minimum safe distances: ${MIN_SAFE_DISTANCE.horizontal}px horizontal, ${MIN_SAFE_DISTANCE.vertical}px vertical`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyTemplates();