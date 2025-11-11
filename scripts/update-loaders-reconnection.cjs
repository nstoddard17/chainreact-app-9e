#!/usr/bin/env node
/**
 * Updates all provider options loaders to include reconnection logic
 */

const fs = require('fs');
const path = require('path');

const LOADERS_DIR = path.join(__dirname, '../components/workflows/configuration/providers');

// Loaders that already have the fix
const SKIP_LOADERS = [
  'hubspot/hubspotOptionsLoader.ts',
  'slack/slackOptionsLoader.ts',
  // These already have reconnection logic (verified earlier)
  'dropbox/dropboxOptionsLoader.ts',
  'google-analytics/GoogleAnalyticsOptionsLoader.ts',
  'google-calendar/GoogleCalendarOptionsLoader.ts',
  'gumroad/gumroadOptionsLoader.ts',
];

// Find all loader files
function findLoaders(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      findLoaders(fullPath, files);
    } else if (item.endsWith('OptionsLoader.ts') || item.endsWith('optionsLoader.ts')) {
      const relativePath = path.relative(LOADERS_DIR, fullPath);
      if (!SKIP_LOADERS.includes(relativePath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

// Update a single loader file
function updateLoader(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Extract provider name from directory
  const dirName = path.basename(path.dirname(filePath));
  const provider = dirName.toLowerCase();

  // Check if import already exists
  if (!content.includes('parseErrorAndHandleReconnection')) {
    // Find the last import statement
    const importMatches = content.match(/^import.*from.*$/gm);
    if (importMatches && importMatches.length > 0) {
      const lastImport = importMatches[importMatches.length - 1];
      const insertIndex = content.indexOf(lastImport) + lastImport.length;

      content =
        content.slice(0, insertIndex) +
        "\nimport { parseErrorAndHandleReconnection } from '@/lib/utils/integration-reconnection';" +
        content.slice(insertIndex);

      modified = true;
    }
  }

  // Find and replace all "if (!response.ok)" blocks
  const errorPattern = /if \(!response\.ok\) \{\s*throw new Error\([^)]+\);?\s*\}/g;
  const replacementPattern = `if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = await parseErrorAndHandleReconnection(
          errorText,
          '${provider}',
          \`API error: \${response.status}\`
        );
        throw new Error(errorMessage);
      }`;

  const matches = content.match(errorPattern);
  if (matches && matches.length > 0) {
    content = content.replace(errorPattern, replacementPattern);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }

  return false;
}

// Main execution
console.log('🔍 Finding provider options loaders...\n');

const loaders = findLoaders(LOADERS_DIR);

console.log(`Found ${loaders.length} loaders to update\n`);

let updated = 0;
let skipped = 0;

for (const loader of loaders) {
  if (updateLoader(loader)) {
    updated++;
  } else {
    skipped++;
    console.log(`⏭️  Skipped: ${path.relative(process.cwd(), loader)} (no changes needed)`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   ✅ Updated: ${updated}`);
console.log(`   ⏭️  Skipped: ${skipped}`);
console.log(`   📁 Total: ${loaders.length}`);
