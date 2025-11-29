const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeTemplate(templateName) {
  try {
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('name', templateName)
      .single();

    if (error) {
      console.error('Error fetching template:', error);
      return;
    }

    console.log(`\n📋 Analyzing: ${template.name}\n`);
    console.log('=' .repeat(80));

    const nodes = template.nodes || [];
    const edges = template.connections || template.edges || [];

    console.log(`\n📊 Nodes (${nodes.length}):`);
    nodes.forEach(node => {
      console.log(`  ${node.id}:`);
      console.log(`    Title: ${node.data?.title || 'N/A'}`);
      console.log(`    Type: ${node.data?.type || node.type}`);
      console.log(`    Position: (${node.position?.x || 'N/A'}, ${node.position?.y || 'N/A'})`);
      console.log(`    Is Trigger: ${node.data?.isTrigger || false}`);
    });

    console.log(`\n🔗 Edges (${edges.length}):`);
    edges.forEach((edge, idx) => {
      const source = edge.source || edge.from;
      const target = edge.target || edge.to;
      const sourceNode = nodes.find(n => n.id === source);
      const targetNode = nodes.find(n => n.id === target);

      console.log(`  ${idx + 1}. ${sourceNode?.data?.title || source} → ${targetNode?.data?.title || target}`);
      console.log(`     Source: ${source}`);
      console.log(`     Target: ${target}`);
      console.log(`     Type: ${edge.type || 'default'}`);
    });

    // Build chain analysis
    console.log(`\n🔍 Chain Analysis:`);

    // Find root nodes
    const targetSet = new Set(edges.map(e => e.target || e.to));
    const rootNodes = nodes.filter(n => !targetSet.has(n.id));

    console.log(`  Root nodes (${rootNodes.length}):`);
    rootNodes.forEach(root => {
      console.log(`    - ${root.data?.title || root.id} (${root.id})`);
    });

    // Trace chains from each root
    const adjacency = {};
    edges.forEach(edge => {
      const source = edge.source || edge.from;
      const target = edge.target || edge.to;
      if (!adjacency[source]) adjacency[source] = [];
      adjacency[source].push(target);
    });

    console.log(`\n  Chain Structure:`);

    function traceChain(nodeId, depth = 0, visited = new Set()) {
      if (visited.has(nodeId)) {
        console.log(`${'  '.repeat(depth + 2)}[Circular reference to ${nodeId}]`);
        return;
      }

      visited.add(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      const children = adjacency[nodeId] || [];

      console.log(`${'  '.repeat(depth + 2)}${node?.data?.title || nodeId} (${nodeId})`);

      if (children.length > 1) {
        console.log(`${'  '.repeat(depth + 2)}  ⚡ Branches to ${children.length} paths:`);
      }

      children.forEach(childId => {
        traceChain(childId, depth + 1, new Set(visited));
      });
    }

    rootNodes.forEach(root => {
      console.log(`\n  From ${root.data?.title || root.id}:`);
      traceChain(root.id, 0);
    });

    // Identify issues
    console.log(`\n⚠️  Potential Issues:`);

    // Check for overlapping positions
    const positionMap = {};
    let overlaps = 0;
    nodes.forEach(node => {
      if (node.position) {
        const key = `${Math.round(node.position.x)},${Math.round(node.position.y)}`;
        if (positionMap[key]) {
          console.log(`  - Nodes at same position (${key}): ${positionMap[key]} and ${node.data?.title || node.id}`);
          overlaps++;
        } else {
          positionMap[key] = node.data?.title || node.id;
        }
      }
    });

    // Check for nodes too close
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        if (n1.position && n2.position) {
          const dx = Math.abs(n1.position.x - n2.position.x);
          const dy = Math.abs(n1.position.y - n2.position.y);
          if (dx < 100 && dy < 100 && (dx > 0 || dy > 0)) {
            console.log(`  - Too close: ${n1.data?.title || n1.id} and ${n2.data?.title || n2.id} (dx=${dx}, dy=${dy})`);
          }
        }
      }
    }

    if (overlaps === 0) {
      console.log('  No exact overlaps detected');
    }

    return { nodes, edges, adjacency, rootNodes };

  } catch (error) {
    console.error('Error:', error);
  }
}

async function analyzeAllTemplates() {
  const { data: templates, error } = await supabase
    .from('templates')
    .select('name')
    .order('name');

  if (error) {
    console.error('Error fetching templates:', error);
    return;
  }

  console.log('Available templates:');
  templates.forEach((t, idx) => {
    console.log(`${idx + 1}. ${t.name}`);
  });

  // Analyze the first few templates to understand structure
  const templatesToAnalyze = [
    'Smart Email Triage - Sales & Support Router',
    'AI Agent Test Workflow - Customer Service',
    'Slack Customer Support System'
  ];

  for (const name of templatesToAnalyze) {
    await analyzeTemplate(name);
  }
}

// Run analysis
analyzeAllTemplates();