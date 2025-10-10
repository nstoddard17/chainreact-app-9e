const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Conservative spacing to ensure no overlaps
const SPACING = {
  startX: 600,           // Start further right for better centering
  startY: 100,
  verticalGap: 200,      // Vertical distance between nodes
  horizontalGap: 550,    // Horizontal distance between parallel chains (increased)
  nodeWidth: 350,
  nodeHeight: 150,
  minSafeDistance: 450   // Absolute minimum distance horizontally
};

function analyzeWorkflow(nodes, edges) {
  const adjacency = { forward: {}, backward: {} };

  edges.forEach(edge => {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;

    if (!adjacency.forward[source]) adjacency.forward[source] = [];
    if (!adjacency.backward[target]) adjacency.backward[target] = [];

    adjacency.forward[source].push(target);
    adjacency.backward[target].push(source);
  });

  // Find roots (nodes with no incoming edges or triggers)
  const roots = nodes.filter(node =>
    !adjacency.backward[node.id] ||
    adjacency.backward[node.id].length === 0 ||
    node.data?.isTrigger
  );

  return { adjacency, roots };
}

function assignLevelsAndColumns(nodes, edges) {
  const { adjacency, roots } = analyzeWorkflow(nodes, edges);
  const nodeInfo = {};

  // Initialize all nodes
  nodes.forEach(node => {
    nodeInfo[node.id] = {
      level: -1,
      column: -1,
      visited: false,
      isBranch: false,
      branches: []
    };
  });

  // Track column usage at each level
  const levelColumns = {};

  function processNode(nodeId, level, preferredColumn, branchPath = []) {
    if (nodeInfo[nodeId].visited) return;

    nodeInfo[nodeId].visited = true;
    nodeInfo[nodeId].level = level;

    // Initialize level if needed
    if (!levelColumns[level]) {
      levelColumns[level] = new Set();
    }

    // Assign column
    let column = preferredColumn;

    // Check if this column is already taken at this level
    while (levelColumns[level].has(column)) {
      column++;
    }

    nodeInfo[nodeId].column = column;
    levelColumns[level].add(column);

    // Check if this is a branching node
    const children = adjacency.forward[nodeId] || [];

    if (children.length > 1) {
      nodeInfo[nodeId].isBranch = true;
      nodeInfo[nodeId].branches = children;

      // Process each branch with different columns
      children.forEach((childId, index) => {
        const childColumn = column + index - Math.floor(children.length / 2);
        processNode(childId, level + 1, childColumn, [...branchPath, nodeId]);
      });
    } else if (children.length === 1) {
      // Single child continues in same column
      processNode(children[0], level + 1, column, branchPath);
    }
  }

  // Process each root and its tree
  roots.forEach((root, index) => {
    const startColumn = index * 3; // Space out different roots
    processNode(root.id, 0, startColumn);
  });

  // Handle any unvisited nodes
  nodes.forEach(node => {
    if (!nodeInfo[node.id].visited) {
      const maxLevel = Math.max(...Object.values(nodeInfo).map(n => n.level), -1) + 1;
      processNode(node.id, maxLevel, 0);
    }
  });

  return nodeInfo;
}

function calculatePositions(nodes, edges) {
  const nodeInfo = assignLevelsAndColumns(nodes, edges);

  // Find min and max columns to center the workflow
  let minColumn = Infinity;
  let maxColumn = -Infinity;

  Object.values(nodeInfo).forEach(info => {
    if (info.column < minColumn) minColumn = info.column;
    if (info.column > maxColumn) maxColumn = info.column;
  });

  // Calculate center offset
  const columnRange = maxColumn - minColumn;
  const centerOffset = -minColumn * SPACING.horizontalGap + (columnRange * SPACING.horizontalGap) / 2;

  // Generate final positions
  const positions = {};

  nodes.forEach(node => {
    const info = nodeInfo[node.id];

    positions[node.id] = {
      x: SPACING.startX - centerOffset + info.column * SPACING.horizontalGap,
      y: SPACING.startY + info.level * SPACING.verticalGap
    };
  });

  // Verify no overlaps
  const positionCheck = {};
  let hasCollisions = false;

  Object.entries(positions).forEach(([nodeId, pos]) => {
    const key = `${Math.round(pos.x)},${Math.round(pos.y)}`;
    if (positionCheck[key]) {
      console.log(`      ⚠️  Collision detected at ${key}: ${positionCheck[key]} and ${nodeId}`);
      hasCollisions = true;
      // Offset the colliding node
      positions[nodeId].x += SPACING.horizontalGap;
    } else {
      positionCheck[key] = nodeId;
    }
  });

  if (hasCollisions) {
    console.log('      🔄 Applied collision corrections');
  }

  return positions;
}

async function fixTemplates() {
  try {
    console.log('🚀 Final Template Position Fix\n');
    console.log('=' .repeat(80));

    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }

    let fixedCount = 0;

    for (const template of templates) {
      const nodes = template.nodes || [];
      const edges = template.connections || template.edges || [];

      if (nodes.length === 0) continue;

      console.log(`\n📋 ${template.name}`);
      console.log(`   Nodes: ${nodes.length}, Edges: ${edges.length}`);

      // Calculate new positions
      const positions = calculatePositions(nodes, edges);

      // Apply positions to nodes
      const updatedNodes = nodes.map(node => ({
        ...node,
        position: {
          x: Math.round(positions[node.id]?.x || SPACING.startX),
          y: Math.round(positions[node.id]?.y || SPACING.startY)
        },
        measured: node.measured || {
          width: SPACING.nodeWidth,
          height: SPACING.nodeHeight
        }
      }));

      // Check for any remaining issues
      let issues = 0;
      for (let i = 0; i < updatedNodes.length; i++) {
        for (let j = i + 1; j < updatedNodes.length; j++) {
          const n1 = updatedNodes[i];
          const n2 = updatedNodes[j];
          const dx = Math.abs(n1.position.x - n2.position.x);
          const dy = Math.abs(n1.position.y - n2.position.y);

          if (dx < SPACING.minSafeDistance && dy < SPACING.nodeHeight) {
            issues++;
          }
        }
      }

      if (issues > 0) {
        console.log(`   ⚠️  ${issues} proximity warnings remain - applying additional spacing`);

        // Apply additional spacing for problematic nodes
        const occupied = new Map();
        updatedNodes.forEach(node => {
          let x = node.position.x;
          let y = node.position.y;

          // Check if position is occupied
          let key = `${x},${y}`;
          while (occupied.has(key)) {
            x += SPACING.horizontalGap;
            key = `${x},${y}`;
          }

          occupied.set(key, true);
          node.position.x = x;
        });
      }

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
        console.log(`   ✅ Successfully repositioned all nodes`);
        fixedCount++;
      }
    }

    console.log('\n' + '=' .repeat(80));
    console.log(`\n✨ Completed! Fixed ${fixedCount}/${templates.length} templates`);
    console.log(`   Spacing: ${SPACING.verticalGap}px vertical, ${SPACING.horizontalGap}px horizontal`);
    console.log(`   Minimum safe distance: ${SPACING.minSafeDistance}px\n`);

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

fixTemplates();