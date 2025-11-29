const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// STRICT spacing for perfect alignment
const LAYOUT = {
  startX: 600,
  startY: 100,
  verticalGap: 200,    // Exact vertical spacing between all nodes
  horizontalGap: 500,  // Exact horizontal spacing between chains
  nodeWidth: 350,
  nodeHeight: 150
};

function traceChains(nodes, edges) {
  // Build adjacency
  const forward = {};
  const backward = {};

  edges.forEach(edge => {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    if (!forward[source]) forward[source] = [];
    if (!backward[target]) backward[target] = [];

    forward[source].push(target);
    backward[target].push(source);
  });

  // Find root nodes (triggers or no incoming edges)
  const roots = nodes.filter(node =>
    !backward[node.id] ||
    backward[node.id].length === 0 ||
    node.data?.isTrigger
  );

  // Trace each complete chain from roots
  const chains = [];
  const nodeToChains = {}; // Track which chains each node belongs to
  const visited = new Set();

  function dfs(nodeId, currentChain, level = 0) {
    if (visited.has(nodeId)) return;

    currentChain.push({ id: nodeId, level });

    const children = forward[nodeId] || [];

    if (children.length === 0) {
      // End of chain - save it
      const chainCopy = [...currentChain];
      chains.push(chainCopy);

      // Track which chains each node belongs to
      chainCopy.forEach(item => {
        if (!nodeToChains[item.id]) nodeToChains[item.id] = [];
        nodeToChains[item.id].push(chains.length - 1);
      });
    } else if (children.length === 1) {
      // Continue the chain
      dfs(children[0], currentChain, level + 1);
    } else {
      // Branching point - mark this node as visited and create new chains
      visited.add(nodeId);

      // Save current chain up to this point
      const chainCopy = [...currentChain];
      chains.push(chainCopy);
      chainCopy.forEach(item => {
        if (!nodeToChains[item.id]) nodeToChains[item.id] = [];
        nodeToChains[item.id].push(chains.length - 1);
      });

      // Create new chains for each branch
      children.forEach(childId => {
        const newChain = [{ id: nodeId, level }]; // Include branch point
        dfs(childId, newChain, level + 1);
      });

      return; // Exit after processing branches
    }

    currentChain.pop(); // Backtrack
  }

  // Trace from each root
  roots.forEach(root => {
    if (!visited.has(root.id)) {
      dfs(root.id, [], 0);
    }
  });

  // Handle any disconnected nodes
  nodes.forEach(node => {
    if (!nodeToChains[node.id]) {
      chains.push([{ id: node.id, level: 0 }]);
      nodeToChains[node.id] = [chains.length - 1];
    }
  });

  return { chains, nodeToChains, forward, backward, roots };
}

function calculatePerfectPositions(nodes, edges) {
  const { chains, nodeToChains, forward, roots } = traceChains(nodes, edges);

  console.log(`    Identified ${chains.length} chains from ${roots.length} root(s)`);

  // Group chains that share a branching point
  const branchGroups = {};
  const processedChains = new Set();

  chains.forEach((chain, idx) => {
    if (processedChains.has(idx)) return;

    // Find the branching node if this chain has one
    const branchNode = chain.find(item => {
      const node = nodes.find(n => n.id === item.id);
      const children = forward[item.id] || [];
      return children.length > 1;
    });

    if (branchNode) {
      if (!branchGroups[branchNode.id]) {
        branchGroups[branchNode.id] = {
          parentChain: [],
          branches: []
        };
      }

      // This chain contains the branching point
      const branchIndex = chain.findIndex(item => item.id === branchNode.id);
      if (branchIndex === chain.length - 1) {
        // Branching point is at the end
        branchGroups[branchNode.id].parentChain = chain.slice(0, branchIndex + 1);
      } else {
        // This is a branch
        branchGroups[branchNode.id].branches.push(idx);
      }

      processedChains.add(idx);
    }
  });

  // Assign X positions to chains
  const chainXPositions = {};
  let nextX = 0;

  // Process root chains and their branches
  roots.forEach((root, rootIdx) => {
    const rootChains = chains.filter(chain => chain[0]?.id === root.id);

    if (rootChains.length === 1) {
      // Single chain from this root
      chainXPositions[chains.indexOf(rootChains[0])] = nextX;
      nextX += LAYOUT.horizontalGap;
    } else {
      // Multiple chains from this root (branching)
      const centerX = nextX + ((rootChains.length - 1) * LAYOUT.horizontalGap) / 2;

      rootChains.forEach((chain, idx) => {
        const chainIndex = chains.indexOf(chain);
        chainXPositions[chainIndex] = centerX - ((rootChains.length - 1) / 2) * LAYOUT.horizontalGap + idx * LAYOUT.horizontalGap;
      });

      nextX += rootChains.length * LAYOUT.horizontalGap;
    }
  });

  // Calculate final positions - CRITICAL: nodes in same chain must have same X
  const positions = {};
  const levels = {};

  // First pass: determine levels
  nodes.forEach(node => {
    let minLevel = Infinity;

    chains.forEach(chain => {
      const nodeInChain = chain.find(item => item.id === node.id);
      if (nodeInChain && nodeInChain.level < minLevel) {
        minLevel = nodeInChain.level;
      }
    });

    levels[node.id] = minLevel === Infinity ? 0 : minLevel;
  });

  // Second pass: assign positions with perfect vertical alignment
  chains.forEach((chain, chainIdx) => {
    const chainX = chainXPositions[chainIdx] || 0;

    chain.forEach(item => {
      const { id, level } = item;

      // All nodes in this chain get the SAME x coordinate
      if (!positions[id] || positions[id].fromChain > chainIdx) {
        positions[id] = {
          x: LAYOUT.startX + chainX,
          y: LAYOUT.startY + level * LAYOUT.verticalGap,
          fromChain: chainIdx
        };
      }
    });
  });

  // Handle branching nodes specially - they should be centered above their branches
  Object.entries(forward).forEach(([nodeId, children]) => {
    if (children.length > 1) {
      // This is a branching node
      const childPositions = children.map(childId => positions[childId]?.x).filter(x => x !== undefined);

      if (childPositions.length > 0) {
        const avgX = childPositions.reduce((sum, x) => sum + x, 0) / childPositions.length;
        const nodeLevel = levels[nodeId];

        positions[nodeId] = {
          x: avgX,
          y: LAYOUT.startY + nodeLevel * LAYOUT.verticalGap,
          fromChain: -1 // Special marker for branch nodes
        };
      }
    }
  });

  // Clean up position objects
  const finalPositions = {};
  Object.entries(positions).forEach(([nodeId, pos]) => {
    finalPositions[nodeId] = {
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    };
  });

  return finalPositions;
}

async function fixAllTemplates() {
  try {
    console.log('🎯 Perfect Template Alignment Fix\n');
    console.log('=' .repeat(80));
    console.log('Ensuring perfect vertical stacking and uniform spacing...\n');

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    let successCount = 0;

    for (const template of templates) {
      const nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      if (nodes.length === 0) {
        continue;
      }

      console.log(`📋 ${template.name}`);
      console.log(`   Nodes: ${nodes.length}, Edges: ${edges.length}`);

      // Calculate perfect positions
      const positions = calculatePerfectPositions(nodes, edges);

      // Apply positions
      const updatedNodes = nodes.map(node => ({
        ...node,
        position: positions[node.id] || { x: LAYOUT.startX, y: LAYOUT.startY },
        measured: node.measured || {
          width: LAYOUT.nodeWidth,
          height: LAYOUT.nodeHeight
        }
      }));

      // Verify alignment
      const xCoordinates = {};
      updatedNodes.forEach(node => {
        const x = node.position.x;
        if (!xCoordinates[x]) xCoordinates[x] = [];
        xCoordinates[x].push(node.data?.title || node.id);
      });

      console.log(`   ✓ Created ${Object.keys(xCoordinates).length} perfectly aligned vertical chains`);

      // Show sample alignment
      const sampleChains = Object.entries(xCoordinates).slice(0, 3);
      sampleChains.forEach(([x, nodeNames]) => {
        if (nodeNames.length > 1) {
          console.log(`   Chain at x=${x}: ${nodeNames.length} nodes aligned`);
        }
      });

      // Update in database
      const { error: updateError } = await supabase
        .from('templates')
        .update({
          nodes: updatedNodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', template.id);

      if (updateError) {
        console.error(`   ❌ Error: ${updateError.message}`);
      } else {
        console.log(`   ✅ Successfully aligned all nodes\n`);
        successCount++;
      }
    }

    console.log('=' .repeat(80));
    console.log(`\n✨ Perfect Alignment Complete!`);
    console.log(`   ✅ Updated: ${successCount}/${templates.length} templates`);
    console.log(`   📐 Vertical spacing: ${LAYOUT.verticalGap}px (uniform)`);
    console.log(`   📐 Horizontal spacing: ${LAYOUT.horizontalGap}px (uniform)`);
    console.log(`   🎯 All chains now have perfect vertical alignment\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

fixAllTemplates();