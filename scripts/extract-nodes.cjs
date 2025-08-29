#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the original file
const filePath = path.join(__dirname, '..', 'lib', 'workflows', 'availableNodes.ts');
const content = fs.readFileSync(filePath, 'utf-8');

// Parse the file to extract nodes
const lines = content.split('\n');
let inNodeArray = false;
let currentNode = [];
let nodeDepth = 0;
let nodes = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check if we're starting the node array
  if (line.includes('export const ALL_NODE_COMPONENTS: NodeComponent[] = [')) {
    inNodeArray = true;
    continue;
  }
  
  if (!inNodeArray) continue;
  
  // Track brace depth
  const openBraces = (line.match(/\{/g) || []).length;
  const closeBraces = (line.match(/\}/g) || []).length;
  
  if (nodeDepth === 0 && line.trim().startsWith('{')) {
    // Starting a new node
    currentNode = [line];
    nodeDepth += openBraces - closeBraces;
  } else if (nodeDepth > 0) {
    // Inside a node
    currentNode.push(line);
    nodeDepth += openBraces - closeBraces;
    
    if (nodeDepth === 0) {
      // Node complete
      const nodeText = currentNode.join('\n');
      
      // Extract provider ID
      const providerMatch = nodeText.match(/providerId:\s*["']([^"']+)["']/);
      const typeMatch = nodeText.match(/type:\s*["']([^"']+)["']/);
      
      if (typeMatch) {
        nodes.push({
          type: typeMatch[1],
          providerId: providerMatch ? providerMatch[1] : 'generic',
          content: nodeText,
          lineStart: i - currentNode.length + 1,
          lineEnd: i
        });
      }
      
      currentNode = [];
    }
  }
  
  // Check if we've reached the end of the array
  if (line.includes(']') && nodeDepth === 0 && inNodeArray) {
    break;
  }
}

// Group nodes by provider
const nodesByProvider = {};
nodes.forEach(node => {
  if (!nodesByProvider[node.providerId]) {
    nodesByProvider[node.providerId] = [];
  }
  nodesByProvider[node.providerId].push(node);
});

// Output statistics
console.log('Node Extraction Summary:');
console.log('========================');
console.log(`Total nodes found: ${nodes.length}`);
console.log(`Providers found: ${Object.keys(nodesByProvider).length}`);
console.log('\nNodes per provider:');

Object.entries(nodesByProvider)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([provider, providerNodes]) => {
    console.log(`  ${provider}: ${providerNodes.length} nodes`);
    providerNodes.forEach(node => {
      console.log(`    - ${node.type} (lines ${node.lineStart}-${node.lineEnd})`);
    });
  });

// Save the analysis to a JSON file for further processing
const outputPath = path.join(__dirname, '..', 'lib', 'workflows', 'nodes', 'node-analysis.json');
fs.writeFileSync(outputPath, JSON.stringify({
  totalNodes: nodes.length,
  providers: Object.keys(nodesByProvider),
  nodesByProvider: Object.fromEntries(
    Object.entries(nodesByProvider).map(([provider, providerNodes]) => [
      provider,
      providerNodes.map(n => ({
        type: n.type,
        lineStart: n.lineStart,
        lineEnd: n.lineEnd
      }))
    ])
  ),
  fullNodes: nodes
}, null, 2));

console.log(`\nAnalysis saved to: ${outputPath}`);