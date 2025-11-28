const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, 'lib', 'workflows', 'nodes', 'providers');

// List of main integration providers (excluding logic, utility, misc, automation)
const mainProviders = [
  'gmail', 'slack', 'discord', 'notion', 'airtable', 'hubspot', 'stripe',
  'google-sheets', 'google-calendar', 'google-docs', 'google-drive',
  'google-analytics', 'github', 'teams', 'outlook', 'onenote', 'onedrive',
  'dropbox', 'shopify', 'monday', 'trello', 'twitter', 'facebook', 'mailchimp',
  'microsoft-excel'
];

const results = {};

mainProviders.forEach(provider => {
  const providerPath = path.join(providersDir, provider);
  const indexPath = path.join(providerPath, 'index.ts');

  if (!fs.existsSync(indexPath)) {
    results[provider] = { exists: false };
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf-8');

  // Count by looking at import statements
  const actionImports = content.match(/from\s+["']\.\/actions\/.*?\.schema["']/g) || [];
  const triggerImports = content.match(/from\s+["']\.\/triggers\/.*?\.schema["']/g) || [];

  // Also extract node names from export
  const exportMatch = content.match(/export const \w+Nodes.*?\[([\s\S]*?)\]/);
  let nodeList = [];
  if (exportMatch && exportMatch[1]) {
    nodeList = exportMatch[1]
      .split(',')
      .map(n => n.trim())
      .filter(n => n && !n.startsWith('//') && n.length > 0);
  }

  results[provider] = {
    exists: true,
    actionCount: actionImports.length,
    triggerCount: triggerImports.length,
    totalNodes: actionImports.length + triggerImports.length,
    actions: actionImports.map(i => i.match(/\/([^\/]+)\.schema/)[1]),
    triggers: triggerImports.map(i => i.match(/\/([^\/]+)\.schema/)[1]),
    nodeList: nodeList
  };
});

// Print results
console.log('\n=== ChainReact Integration Coverage ===\n');

let totalActions = 0;
let totalTriggers = 0;

mainProviders.forEach(provider => {
  const data = results[provider];
  if (!data.exists) {
    console.log(`❌ ${provider}: NOT IMPLEMENTED`);
    return;
  }

  totalActions += data.actionCount;
  totalTriggers += data.triggerCount;

  console.log(`\n✅ ${provider.toUpperCase()}`);
  console.log(`   Actions: ${data.actionCount}`);
  console.log(`   Triggers: ${data.triggerCount}`);
  console.log(`   Total: ${data.totalNodes}`);
});

console.log('\n=== SUMMARY ===');
console.log(`Total Providers: ${mainProviders.filter(p => results[p].exists).length}/${mainProviders.length}`);
console.log(`Total Actions: ${totalActions}`);
console.log(`Total Triggers: ${totalTriggers}`);
console.log(`Grand Total: ${totalActions + totalTriggers}`);
console.log('\n');