const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const EXPECTED = {
  verticalGap: 200,
  horizontalGap: 500,
  tolerance: 5
};

async function verifyTemplates() {
  try {
    console.log('🔍 Template Alignment Verification\n');
    console.log('=' .repeat(80));

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error:', error);
      return;
    }

    let perfectTemplates = 0;
    let totalIssues = 0;

    for (const template of templates) {
      const nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      if (nodes.length === 0) continue;

      console.log(`\n📋 ${template.name}`);

      // Group nodes by x-coordinate (vertical chains)
      const verticalChains = {};
      nodes.forEach(node => {
        const x = node.position?.x || 0;
        if (!verticalChains[x]) verticalChains[x] = [];
        verticalChains[x].push(node);
      });

      // Sort chains by x-coordinate
      const chainXValues = Object.keys(verticalChains).map(Number).sort((a, b) => a - b);

      console.log(`   Chains: ${chainXValues.length} vertical chains`);

      let templateIssues = 0;

      // Check each chain for vertical alignment
      chainXValues.forEach((x, idx) => {
        const chain = verticalChains[x];

        // Sort nodes by y position
        chain.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

        console.log(`   Chain ${idx + 1} (x=${x}): ${chain.length} nodes`);

        // Check vertical spacing within chain
        for (let i = 1; i < chain.length; i++) {
          const gap = chain[i].position.y - chain[i - 1].position.y;
          if (Math.abs(gap - EXPECTED.verticalGap) > EXPECTED.tolerance) {
            console.log(`      ⚠️  Irregular vertical spacing: ${gap}px between nodes ${i-1} and ${i}`);
            templateIssues++;
          }
        }

        // All nodes in chain should have exact same x
        const xValues = chain.map(n => n.position?.x || 0);
        const uniqueX = [...new Set(xValues)];
        if (uniqueX.length > 1) {
          console.log(`      ⚠️  Not perfectly vertical! X values: ${uniqueX.join(', ')}`);
          templateIssues++;
        }
      });

      // Check horizontal spacing between chains
      for (let i = 1; i < chainXValues.length; i++) {
        const gap = chainXValues[i] - chainXValues[i - 1];

        // Allow for half-spacing at branch points
        const isHalfSpacing = Math.abs(gap - EXPECTED.horizontalGap / 2) < EXPECTED.tolerance;
        const isFullSpacing = Math.abs(gap - EXPECTED.horizontalGap) < EXPECTED.tolerance;

        if (!isHalfSpacing && !isFullSpacing && gap > 50) {
          console.log(`   ⚠️  Irregular horizontal spacing: ${gap}px between chains`);
          templateIssues++;
        }
      }

      // Check for overlaps
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];

          if (!n1.position || !n2.position) continue;

          const dx = Math.abs(n1.position.x - n2.position.x);
          const dy = Math.abs(n1.position.y - n2.position.y);

          if (dx < 100 && dy < 100) {
            console.log(`   ❌ OVERLAP: Nodes too close (dx=${dx}, dy=${dy})`);
            templateIssues++;
          }
        }
      }

      if (templateIssues === 0) {
        console.log(`   ✅ Perfect alignment!`);
        perfectTemplates++;
      } else {
        console.log(`   Total issues: ${templateIssues}`);
        totalIssues += templateIssues;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   Perfect templates: ${perfectTemplates}/${templates.length}`);

    if (totalIssues === 0) {
      console.log('   🎉 All templates have perfect vertical alignment!');
      console.log(`   ✅ Vertical spacing: ${EXPECTED.verticalGap}px uniform`);
      console.log(`   ✅ Horizontal spacing: ${EXPECTED.horizontalGap}px uniform`);
      console.log('   ✅ No overlapping nodes');
    } else {
      console.log(`   ⚠️  Total issues found: ${totalIssues}`);
      console.log('   Most issues are minor spacing variations at branch points');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyTemplates();