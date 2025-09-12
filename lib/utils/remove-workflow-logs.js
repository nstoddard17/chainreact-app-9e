#!/usr/bin/env node

/**
 * Script to remove or comment out excessive console.log statements
 * from the CollaborativeWorkflowBuilder component
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../components/workflows/CollaborativeWorkflowBuilder.tsx');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// List of console.log patterns to remove completely (very noisy, repetitive logs)
const logsToRemove = [
  /console\.log\('🔍 Checking connection for:.*?\);?\n/g,
  /console\.log\('📦 storeIntegrations updated:.*?\);?\n/g,
  /console\.log\('📋 Integration details:.*?\n.*?\}\)\)\n.*?\}/gs,
  /console\.log\('🔄 Fetching integrations on mount.*?\);?\n/g,
  /console\.log\('🔄 Current storeIntegrations before fetch:.*?\);?\n/g,
  /console\.log\('🔍 Workflow trigger detection:.*?\);?\n/g,
  /console\.log\('⏭️ \[WorkflowBuilder\] Skipping rebuild - workflow already loaded:.*?\);?\n/g,
  /console\.log\('🏪 \[WorkflowStore\] Setting current workflow:.*?\);?\n/g,
  /console\.log\('📊 Re-auth notification:.*?\);?\n/g,
];

// List of console.log patterns to comment out (might be useful for debugging)
const logsToComment = [
  /console\.log\('🔄 \[WorkflowBuilder\].*?\);/g,
  /console\.log\('📝 \[WorkflowBuilder\] Setting workflow name:.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\}\);/gs,
  /console\.log\('🔍 \[WorkflowBuilder\] Fresh workflow loaded from API:.*?\);/g,
  /console\.log\('📦 \[WorkflowBuilder\] Checking all nodes for chain metadata:.*?\);/g,
  /console\.log\('  Node.*?hasChainInId.*?\);/g,
];

// Remove specified logs
logsToRemove.forEach(pattern => {
  const matches = content.match(pattern);
  if (matches) {
    console.log(`Removing ${matches.length} instances of pattern: ${pattern.source.substring(0, 50)}...`);
    content = content.replace(pattern, '');
  }
});

// Comment out specified logs
logsToComment.forEach(pattern => {
  const matches = content.match(pattern);
  if (matches) {
    console.log(`Commenting out ${matches.length} instances of pattern: ${pattern.source.substring(0, 50)}...`);
    content = content.replace(pattern, (match) => `// ${match}`);
  }
});

// Write the file back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Successfully cleaned up console.log statements in CollaborativeWorkflowBuilder.tsx');