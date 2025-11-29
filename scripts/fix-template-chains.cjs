const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Proper spacing to prevent any overlaps
const LAYOUT_CONFIG = {
  startX: 400,
  startY: 100,
  verticalSpacing: 200,      // Space between nodes vertically
  horizontalSpacing: 500,     // Space between parallel chains (increased)
  nodeWidth: 350,            // Approximate width of a node
  nodeHeight: 150,           // Approximate height of a node
  minSafeDistance: 400       // Minimum safe distance between any nodes horizontally
};

function buildChainStructure(nodes, edges) {
  // Build adjacency maps
  const children = {};
  const parents = {};

  edges.forEach(edge => {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    if (!children[source]) children[source] = [];
    if (!parents[target]) parents[target] = [];

    children[source].push(target);
    parents[target].push(source);
  });

  // Find root nodes
  const roots = nodes.filter(node =>
    !parents[node.id] || parents[node.id].length === 0 || node.data?.isTrigger
  );

  return { children, parents, roots };
}

function assignNodeLevels(nodes, edges) {
  const { children, parents, roots } = buildChainStructure(nodes, edges);
  const levels = {};
  const visited = new Set();

  // BFS to assign levels
  const queue = roots.map(root => ({ id: root.id, level: 0 }));

  while (queue.length > 0) {
    const { id, level } = queue.shift();

    if (visited.has(id)) continue;
    visited.add(id);

    levels[id] = level;

    const nodeChildren = children[id] || [];
    nodeChildren.forEach(childId => {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  return levels;
}

function identifyChains(nodes, edges) {
  const { children, parents, roots } = buildChainStructure(nodes, edges);
  const chains = [];
  const nodeToChain = {};

  // For each root, trace all possible chains
  roots.forEach(root => {
    const visited = new Set();

    function traceChains(nodeId, currentPath = [], chainIndex = chains.length) {
      visited.add(nodeId);
      currentPath.push(nodeId);

      const nodeChildren = children[nodeId] || [];

      if (nodeChildren.length === 0) {
        // End of chain
        chains.push([...currentPath]);
        currentPath.forEach(id => {
          if (!nodeToChain[id]) nodeToChain[id] = [];
          nodeToChain[id].push(chains.length - 1);
        });
      } else if (nodeChildren.length === 1) {
        // Continue chain
        if (!visited.has(nodeChildren[0])) {
          traceChains(nodeChildren[0], currentPath, chainIndex);
        }
      } else {
        // Branching point - create new chains for each branch
        nodeChildren.forEach((childId, branchIndex) => {
          if (!visited.has(childId)) {
            const newPath = [...currentPath];
            traceChains(childId, newPath, chains.length);
          }
        });
      }

      currentPath.pop();
    }

    traceChains(root.id);
  });

  return { chains, nodeToChain };
}

function calculateOptimalPositions(nodes, edges) {
  const levels = assignNodeLevels(nodes, edges);
  const { chains, nodeToChain } = identifyChains(nodes, edges);
  const { children } = buildChainStructure(nodes, edges);

  console.log(`    Found ${chains.length} chains in workflow`);

  // Group chains by their starting point
  const chainGroups = {};
  chains.forEach((chain, index) => {
    const root = chain[0];
    if (!chainGroups[root]) chainGroups[root] = [];
    chainGroups[root].push(index);
  });

  // Assign x positions to chains
  const chainXPositions = {};
  let currentGroupX = 0;

  Object.keys(chainGroups).forEach((root, groupIndex) => {
    const groupChains = chainGroups[root];
    const numChains = groupChains.length;

    // Center this group of chains
    const groupWidth = (numChains - 1) * LAYOUT_CONFIG.horizontalSpacing;
    const startX = LAYOUT_CONFIG.startX + currentGroupX - groupWidth / 2;

    groupChains.forEach((chainIndex, i) => {
      chainXPositions[chainIndex] = startX + i * LAYOUT_CONFIG.horizontalSpacing;
    });

    // Move to next group position if there are multiple root groups
    if (Object.keys(chainGroups).length > 1) {
      currentGroupX += (numChains + 1) * LAYOUT_CONFIG.horizontalSpacing;
    }
  });

  // Position nodes
  const positions = {};
  const positionedNodes = new Set();

  nodes.forEach(node => {
    const level = levels[node.id] || 0;
    const nodeChains = nodeToChain[node.id] || [];

    let x, y;
    y = LAYOUT_CONFIG.startY + level * LAYOUT_CONFIG.verticalSpacing;

    if (nodeChains.length === 0) {
      // Disconnected node
      x = LAYOUT_CONFIG.startX;
    } else if (nodeChains.length === 1) {
      // Node belongs to single chain
      x = chainXPositions[nodeChains[0]] || LAYOUT_CONFIG.startX;
    } else {
      // Node belongs to multiple chains (branching point)
      // Place it in the middle of its branches
      const xPositions = nodeChains.map(c => chainXPositions[c] || LAYOUT_CONFIG.startX);
      x = xPositions.reduce((sum, pos) => sum + pos, 0) / xPositions.length;
    }

    // Special handling for nodes that branch
    const nodeChildren = children[node.id] || [];
    if (nodeChildren.length > 1) {
      // This is a branching node - ensure children are properly spaced
      const childChains = nodeChildren.map(childId => {
        const chains = nodeToChain[childId] || [];
        return chains[0]; // Primary chain for this child
      }).filter(c => c !== undefined);

      // Adjust chain positions if needed to ensure proper spacing
      if (childChains.length > 1) {
        const baseX = x;
        const totalWidth = (childChains.length - 1) * LAYOUT_CONFIG.horizontalSpacing;
        const startX = baseX - totalWidth / 2;

        childChains.forEach((chainIdx, i) => {
          // Update all nodes in this chain to use the new x position
          const newX = startX + i * LAYOUT_CONFIG.horizontalSpacing;

          chains[chainIdx]?.forEach(nodeId => {
            if (nodeId !== node.id) { // Don't move the branching node itself
              const nodeLevel = levels[nodeId] || 0;
              if (nodeLevel > level) { // Only move nodes below the branch
                positions[nodeId] = {
                  x: newX,
                  y: LAYOUT_CONFIG.startY + nodeLevel * LAYOUT_CONFIG.verticalSpacing
                };
              }
            }
          });
        });
      }
    }

    // Store position if not already set by branch adjustment
    if (!positions[node.id]) {
      positions[node.id] = { x, y };
    }
  });

  return positions;
}

function applyPositionsToNodes(nodes, edges) {
  const positions = calculateOptimalPositions(nodes, edges);

  return nodes.map(node => ({
    ...node,
    position: {
      x: Math.round(positions[node.id]?.x || LAYOUT_CONFIG.startX),
      y: Math.round(positions[node.id]?.y || LAYOUT_CONFIG.startY)
    },
    measured: node.measured || {
      width: LAYOUT_CONFIG.nodeWidth,
      height: LAYOUT_CONFIG.nodeHeight
    }
  }));
}

async function fixAllTemplates() {
  try {
    console.log('🔧 Advanced Template Chain Fixing\n');
    console.log('=' .repeat(80));

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    console.log(`\n📊 Processing ${templates.length} templates...\n`);

    let successCount = 0;

    for (const template of templates) {
      console.log(`\n📋 ${template.name}`);
      console.log(`   ID: ${template.id}`);

      const nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      if (nodes.length === 0) {
        console.log('   ⚠️  No nodes found, skipping');
        continue;
      }

      console.log(`   Nodes: ${nodes.length}, Edges: ${edges.length}`);

      // Apply new positions
      console.log('   🔄 Recalculating positions...');
      const fixedNodes = applyPositionsToNodes(nodes, edges);

      // Show sample of changes
      console.log('   📍 Sample position changes:');
      for (let i = 0; i < Math.min(3, nodes.length); i++) {
        const oldNode = nodes[i];
        const newNode = fixedNodes[i];
        const title = oldNode.data?.title || oldNode.id;
        console.log(`      "${title}": (${oldNode.position?.x || '?'}, ${oldNode.position?.y || '?'}) → (${newNode.position.x}, ${newNode.position.y})`);
      }

      // Update in database
      const { error: updateError } = await supabase
        .from('templates')
        .update({
          nodes: fixedNodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (updateError) {
        console.error(`   ❌ Error updating: ${updateError.message}`);
      } else {
        console.log('   ✅ Successfully updated with proper chain separation');
        successCount++;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n🎉 Template Chain Fixing Complete!');
    console.log(`   ✅ Successfully updated: ${successCount}/${templates.length} templates`);
    console.log(`   📐 Vertical spacing: ${LAYOUT_CONFIG.verticalSpacing}px`);
    console.log(`   📐 Horizontal spacing: ${LAYOUT_CONFIG.horizontalSpacing}px`);
    console.log('\n✨ All chains should now be properly separated!\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Run the fix
fixAllTemplates();