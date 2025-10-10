const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Expected spacing values
const EXPECTED_SPACING = {
  vertical: 200,
  horizontal: 450,
  tolerance: 5  // Allow small tolerance for rounding
};

function analyzeTemplateSpacing(template) {
  const nodes = template.nodes || [];
  const edges = template.connections || template.edges || [];

  if (nodes.length === 0) {
    return { valid: true, issues: [], details: 'No nodes' };
  }

  const issues = [];
  const spacings = {
    vertical: new Set(),
    horizontal: new Set()
  };

  // Build adjacency map
  const adjacencyMap = {};
  const reverseAdjacencyMap = {};

  edges.forEach(edge => {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    if (!adjacencyMap[source]) adjacencyMap[source] = [];
    if (!reverseAdjacencyMap[target]) reverseAdjacencyMap[target] = [];

    adjacencyMap[source].push(target);
    reverseAdjacencyMap[target].push(source);
  });

  // Check spacing between connected nodes
  edges.forEach(edge => {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);

    if (sourceNode?.position && targetNode?.position) {
      const dx = targetNode.position.x - sourceNode.position.x;
      const dy = targetNode.position.y - sourceNode.position.y;

      // Vertical connections (same x, different y)
      if (Math.abs(dx) < 10) {
        spacings.vertical.add(Math.abs(dy));

        if (Math.abs(dy - EXPECTED_SPACING.vertical) > EXPECTED_SPACING.tolerance) {
          issues.push(`Vertical spacing: "${sourceNode.data?.title || source}" → "${targetNode.data?.title || target}" = ${dy}px (expected ${EXPECTED_SPACING.vertical}px)`);
        }
      }

      // Horizontal connections (same y, different x)
      if (Math.abs(dy) < 10) {
        spacings.horizontal.add(Math.abs(dx));

        if (Math.abs(dx - EXPECTED_SPACING.horizontal) > EXPECTED_SPACING.tolerance && Math.abs(dx) > 50) {
          issues.push(`Horizontal spacing: "${sourceNode.data?.title || source}" → "${targetNode.data?.title || target}" = ${dx}px (expected ${EXPECTED_SPACING.horizontal}px)`);
        }
      }
    }
  });

  // Check for any overlaps
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];

      if (!node1.position || !node2.position) continue;

      const dx = Math.abs(node1.position.x - node2.position.x);
      const dy = Math.abs(node1.position.y - node2.position.y);

      // Check for overlaps (nodes too close)
      if (dx < 300 && dy < 120 && !(dx === 0 && dy === 0)) {
        issues.push(`⚠️  OVERLAP: "${node1.data?.title || node1.id}" and "${node2.data?.title || node2.id}" (dx=${dx}, dy=${dy})`);
      }
    }
  }

  // Check if all nodes have positions
  nodes.forEach(node => {
    if (!node.position) {
      issues.push(`No position: "${node.data?.title || node.id}"`);
    }
  });

  const verticalSpacings = Array.from(spacings.vertical).sort((a, b) => a - b);
  const horizontalSpacings = Array.from(spacings.horizontal).sort((a, b) => a - b);

  return {
    valid: issues.length === 0,
    issues,
    details: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      verticalSpacings: verticalSpacings.length > 0 ? verticalSpacings : 'N/A',
      horizontalSpacings: horizontalSpacings.length > 0 ? horizontalSpacings : 'N/A'
    }
  };
}

async function verifyAllTemplates() {
  try {
    console.log('🔍 Verifying template spacing consistency...\n');

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log(`📊 Checking ${templates.length} templates\n`);
    console.log('=' .repeat(80));

    let allValid = true;
    let totalIssues = 0;

    for (const template of templates) {
      const result = analyzeTemplateSpacing(template);

      console.log(`\n📋 ${template.name}`);
      console.log(`   Nodes: ${result.details.nodeCount}, Edges: ${result.details.edgeCount}`);

      if (result.details.verticalSpacings !== 'N/A') {
        console.log(`   Vertical spacings: ${JSON.stringify(result.details.verticalSpacings)}px`);
      }

      if (result.details.horizontalSpacings !== 'N/A') {
        console.log(`   Horizontal spacings: ${JSON.stringify(result.details.horizontalSpacings)}px`);
      }

      if (result.valid) {
        console.log('   ✅ All spacings are consistent');
      } else {
        console.log('   ❌ Issues found:');
        result.issues.forEach(issue => {
          console.log(`      - ${issue}`);
          totalIssues++;
        });
        allValid = false;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n📊 Verification Summary:');

    if (allValid) {
      console.log('   ✅ All templates have consistent spacing!');
      console.log(`   Expected vertical spacing: ${EXPECTED_SPACING.vertical}px`);
      console.log(`   Expected horizontal spacing: ${EXPECTED_SPACING.horizontal}px`);
    } else {
      console.log(`   ⚠️  Found ${totalIssues} spacing issues across templates`);
      console.log('   Run fix-all-template-positions.cjs to correct these issues');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run verification
verifyAllTemplates();