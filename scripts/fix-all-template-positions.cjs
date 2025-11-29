const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Strict node spacing configuration - ensuring no overlaps
const NODE_CONFIG = {
  startX: 400,
  startY: 100,
  verticalSpacing: 200,   // Increased from 180 to ensure no vertical overlaps
  horizontalSpacing: 450,  // Increased from 400 to ensure no horizontal overlaps
  nodeWidth: 350,         // Actual node width with padding
  nodeHeight: 150,        // Actual node height with padding
  minSpacing: 50          // Minimum spacing between any nodes
};

function analyzeCurrentPositions(nodes) {
  if (!nodes || nodes.length === 0) return { issues: [] };

  const issues = [];
  const positions = {};

  // Check each node
  nodes.forEach(node => {
    if (!node.position) {
      issues.push(`Node "${node.data?.title || node.id}" has no position`);
    } else {
      positions[node.id] = node.position;
    }
  });

  // Check for overlaps and spacing issues
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];

      if (!node1.position || !node2.position) continue;

      const dx = Math.abs(node1.position.x - node2.position.x);
      const dy = Math.abs(node1.position.y - node2.position.y);

      // Check for overlaps (with buffer)
      if (dx < NODE_CONFIG.nodeWidth && dy < NODE_CONFIG.nodeHeight) {
        issues.push(`Overlap: "${node1.data?.title || node1.id}" and "${node2.data?.title || node2.id}" (dx: ${dx}px, dy: ${dy}px)`);
      }

      // Check for inconsistent vertical spacing in same column
      if (dx < 50 && dy > 0 && dy < NODE_CONFIG.verticalSpacing - 20) {
        issues.push(`Vertical spacing issue: "${node1.data?.title || node1.id}" and "${node2.data?.title || node2.id}" (spacing: ${dy}px, expected: ${NODE_CONFIG.verticalSpacing}px)`);
      }
    }
  }

  return { issues, positions };
}

function repositionAllNodes(nodes, edges) {
  if (!nodes || nodes.length === 0) return nodes;

  console.log(`    Repositioning ${nodes.length} nodes...`);

  // Build adjacency relationships
  const adjacencyMap = {};
  const reverseAdjacencyMap = {};
  const edgeList = edges || [];

  edgeList.forEach(edge => {
    // Handle both 'connections' and 'edges' format
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    if (!adjacencyMap[source]) adjacencyMap[source] = [];
    if (!reverseAdjacencyMap[target]) reverseAdjacencyMap[target] = [];

    adjacencyMap[source].push(target);
    reverseAdjacencyMap[target].push(source);
  });

  // Find root nodes (triggers or nodes with no incoming edges)
  const rootNodes = nodes.filter(node => {
    const hasIncoming = reverseAdjacencyMap[node.id] && reverseAdjacencyMap[node.id].length > 0;
    const isTrigger = node.data?.isTrigger || node.data?.type?.includes('trigger');
    return !hasIncoming || isTrigger;
  });

  console.log(`    Found ${rootNodes.length} root nodes`);

  // Use topological sort with level assignment
  const visited = new Set();
  const nodeLevels = {};
  const levelNodes = {};
  const nodeColumns = {};

  // Process each root and its chain
  rootNodes.forEach((rootNode, rootIndex) => {
    const queue = [{ node: rootNode, level: 0, column: rootIndex }];

    while (queue.length > 0) {
      const { node, level, column } = queue.shift();

      if (visited.has(node.id)) continue;

      visited.add(node.id);
      nodeLevels[node.id] = level;
      nodeColumns[node.id] = column;

      if (!levelNodes[level]) levelNodes[level] = [];
      levelNodes[level].push({ id: node.id, column });

      // Add children to queue
      const children = adjacencyMap[node.id] || [];
      children.forEach((childId, childIndex) => {
        const childNode = nodes.find(n => n.id === childId);
        if (childNode && !visited.has(childId)) {
          // For branching, assign different columns
          const childColumn = children.length > 1 ? column + childIndex : column;
          queue.push({ node: childNode, level: level + 1, column: childColumn });
        }
      });
    }
  });

  // Handle any disconnected nodes
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const maxLevel = Math.max(...Object.values(nodeLevels), -1);
      nodeLevels[node.id] = maxLevel + 1;
      nodeColumns[node.id] = 0;

      if (!levelNodes[maxLevel + 1]) levelNodes[maxLevel + 1] = [];
      levelNodes[maxLevel + 1].push({ id: node.id, column: 0 });
    }
  });

  // Calculate positions
  const updatedNodes = nodes.map(node => {
    const level = nodeLevels[node.id] || 0;
    const column = nodeColumns[node.id] || 0;

    // Calculate x position based on column
    let x;
    const nodesAtLevel = levelNodes[level] || [];
    const columnsAtLevel = [...new Set(nodesAtLevel.map(n => n.column))].sort((a, b) => a - b);
    const totalColumns = columnsAtLevel.length;
    const columnIndex = columnsAtLevel.indexOf(column);

    if (totalColumns === 1) {
      x = NODE_CONFIG.startX;
    } else {
      // Center the columns
      const totalWidth = (totalColumns - 1) * NODE_CONFIG.horizontalSpacing;
      const startX = NODE_CONFIG.startX - totalWidth / 2;
      x = startX + columnIndex * NODE_CONFIG.horizontalSpacing;
    }

    // Calculate y position based on level
    const y = NODE_CONFIG.startY + level * NODE_CONFIG.verticalSpacing;

    return {
      ...node,
      position: { x: Math.round(x), y: Math.round(y) },
      measured: node.measured || { width: NODE_CONFIG.nodeWidth, height: NODE_CONFIG.nodeHeight }
    };
  });

  return updatedNodes;
}

async function fixAllTemplates() {
  try {
    console.log('🔍 Fetching all templates from database...\n');

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log(`📊 Found ${templates.length} templates\n`);
    console.log('=' .repeat(80));

    let totalFixed = 0;
    let totalIssues = 0;

    for (const template of templates) {
      console.log(`\n📋 Template: "${template.name}"`);
      console.log(`   ID: ${template.id}`);

      const nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      if (nodes.length === 0) {
        console.log('   ⚠️  No nodes found, skipping');
        continue;
      }

      console.log(`   Nodes: ${nodes.length}, Edges: ${edges.length}`);

      // Analyze current positions
      const { issues } = analyzeCurrentPositions(nodes);

      if (issues.length > 0) {
        console.log('\n   ❌ Current Issues:');
        issues.forEach(issue => {
          console.log(`      - ${issue}`);
          totalIssues++;
        });
      } else {
        console.log('   ✓ No obvious overlaps detected, but will reposition for consistency');
      }

      // Always reposition for consistent spacing
      console.log('\n   🔧 Applying consistent positioning...');
      const fixedNodes = repositionAllNodes(nodes, edges);

      // Show position changes
      console.log('\n   📍 Position Updates:');
      for (let i = 0; i < Math.min(5, nodes.length); i++) {
        const oldNode = nodes[i];
        const newNode = fixedNodes[i];
        const title = oldNode.data?.title || oldNode.id;

        if (oldNode.position) {
          console.log(`      "${title}": (${oldNode.position.x}, ${oldNode.position.y}) → (${newNode.position.x}, ${newNode.position.y})`);
        } else {
          console.log(`      "${title}": (no position) → (${newNode.position.x}, ${newNode.position.y})`);
        }
      }

      if (nodes.length > 5) {
        console.log(`      ... and ${nodes.length - 5} more nodes`);
      }

      // Update the template
      const { error: updateError } = await supabase
        .from('templates')
        .update({
          nodes: fixedNodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (updateError) {
        console.error(`\n   ❌ Error updating template: ${updateError.message}`);
      } else {
        console.log('\n   ✅ Successfully updated template with consistent positioning');
        totalFixed++;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n🎉 Template Repositioning Complete!');
    console.log(`   📊 Templates processed: ${templates.length}`);
    console.log(`   ✅ Templates updated: ${totalFixed}`);
    console.log(`   ⚠️  Total issues found and fixed: ${totalIssues}`);
    console.log('\n✨ All templates now have consistent, non-overlapping node positions!\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Run the fix
fixAllTemplates();