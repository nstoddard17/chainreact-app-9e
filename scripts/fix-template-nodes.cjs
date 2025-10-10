const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Proper node spacing configuration based on CLAUDE.md
const NODE_CONFIG = {
  startX: 400,
  startY: 100,
  verticalSpacing: 180,  // Between nodes vertically
  horizontalSpacing: 400, // Between parallel branches
  nodeWidth: 300,        // Approximate node width
  nodeHeight: 120        // Approximate node height
};

function fixNodePositions(nodes, edges) {
  if (!nodes || nodes.length === 0) return nodes;

  // Build adjacency map
  const adjacencyMap = {};
  const reverseAdjacencyMap = {};

  if (edges && edges.length > 0) {
    edges.forEach(edge => {
      if (!adjacencyMap[edge.source]) adjacencyMap[edge.source] = [];
      if (!reverseAdjacencyMap[edge.target]) reverseAdjacencyMap[edge.target] = [];
      adjacencyMap[edge.source].push(edge.target);
      reverseAdjacencyMap[edge.target].push(edge.source);
    });
  }

  // Find root nodes (no incoming edges)
  const rootNodes = nodes.filter(node => !reverseAdjacencyMap[node.id] || reverseAdjacencyMap[node.id].length === 0);

  // Track positioned nodes and their levels
  const positioned = new Set();
  const nodeLevels = {};
  const levelNodes = {};

  // BFS to assign levels
  const queue = [...rootNodes.map(node => ({ node, level: 0 }))];

  while (queue.length > 0) {
    const { node, level } = queue.shift();

    if (positioned.has(node.id)) continue;

    positioned.add(node.id);
    nodeLevels[node.id] = level;

    if (!levelNodes[level]) levelNodes[level] = [];
    levelNodes[level].push(node.id);

    // Add children to queue
    const children = adjacencyMap[node.id] || [];
    children.forEach(childId => {
      const childNode = nodes.find(n => n.id === childId);
      if (childNode && !positioned.has(childId)) {
        queue.push({ node: childNode, level: level + 1 });
      }
    });
  }

  // Position nodes based on levels
  const updatedNodes = nodes.map(node => {
    const level = nodeLevels[node.id] ?? 0;
    const nodesAtLevel = levelNodes[level] || [node.id];
    const indexAtLevel = nodesAtLevel.indexOf(node.id);
    const totalAtLevel = nodesAtLevel.length;

    let x, y;

    if (totalAtLevel === 1) {
      // Single node at this level - center it
      x = NODE_CONFIG.startX;
    } else {
      // Multiple nodes at this level - distribute horizontally
      const totalWidth = (totalAtLevel - 1) * NODE_CONFIG.horizontalSpacing;
      const startX = NODE_CONFIG.startX - totalWidth / 2;
      x = startX + indexAtLevel * NODE_CONFIG.horizontalSpacing;
    }

    y = NODE_CONFIG.startY + level * NODE_CONFIG.verticalSpacing;

    return {
      ...node,
      position: { x, y }
    };
  });

  return updatedNodes;
}

async function fixAllTemplates() {
  try {
    console.log('Fetching all templates from database...');

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log(`Found ${templates.length} templates\n`);

    for (const template of templates) {
      console.log(`Processing template: ${template.name} (${template.id})`);

      let nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      // Skip if no nodes
      if (!nodes || nodes.length === 0) {
        console.log('  → No nodes found, skipping\n');
        continue;
      }

      // Check for overlapping nodes
      let hasOverlaps = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];

          if (!node1.position || !node2.position) continue;

          const dx = Math.abs(node1.position.x - node2.position.x);
          const dy = Math.abs(node1.position.y - node2.position.y);

          // Check if nodes are too close (potential overlap)
          if (dx < NODE_CONFIG.nodeWidth && dy < NODE_CONFIG.nodeHeight) {
            hasOverlaps = true;
            console.log(`  → Found overlap between "${node1.data?.title || node1.id}" and "${node2.data?.title || node2.id}"`);
          }
        }
      }

      if (hasOverlaps || !nodes[0].position) {
        console.log('  → Fixing node positions...');

        const fixedNodes = fixNodePositions(nodes, edges);

        // Update the template
        const { error: updateError } = await supabase
          .from('templates')
          .update({
            nodes: fixedNodes,
            updated_at: new Date().toISOString()
          })
          .eq('id', template.id);

        if (updateError) {
          console.error(`  → Error updating template: ${updateError.message}`);
        } else {
          console.log('  → ✅ Successfully fixed node positions');
        }
      } else {
        console.log('  → No overlaps detected, skipping');
      }

      console.log('');
    }

    console.log('✨ Template node fixing complete!');

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the fix
fixAllTemplates();