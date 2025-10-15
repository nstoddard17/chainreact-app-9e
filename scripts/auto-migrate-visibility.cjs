/**
 * Automated Visibility Pattern Migration
 *
 * Safely migrates simple legacy patterns to modern visibilityCondition format
 */

const fs = require('fs');
const path = require('path');

// Patterns we can safely auto-migrate
const SAFE_MIGRATIONS = [
  // conditional: { field: 'X', value: 'Y' } => visibilityCondition: { field: 'X', operator: 'equals', value: 'Y' }
  {
    pattern: /conditional:\s*\{\s*field:\s*["']([^"']+)["']\s*,\s*value:\s*["']([^"']+)["']\s*\}/g,
    replace: (match, field, value) => `visibilityCondition: { field: "${field}", operator: "equals", value: "${value}" }`
  },

  // visibleWhen: { field: 'X', equals: 'Y' } => visibilityCondition: { field: 'X', operator: 'equals', value: 'Y' }
  {
    pattern: /visibleWhen:\s*\{\s*field:\s*["']([^"']+)["']\s*,\s*equals:\s*["']([^"']+)["']\s*\}/g,
    replace: (match, field, value) => `visibilityCondition: { field: "${field}", operator: "equals", value: "${value}" }`
  },

  // showWhen: { field: 'value' } => visibilityCondition: { field: 'field', operator: 'equals', value: 'value' }
  {
    pattern: /showWhen:\s*\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*):\s*["']([^"']+)["']\s*\}/g,
    replace: (match, field, value) => `visibilityCondition: { field: "${field}", operator: "equals", value: "${value}" }`
  },
];

/**
 * Migrate a single file
 */
function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changesMade = 0;

  for (const migration of SAFE_MIGRATIONS) {
    const matches = content.match(migration.pattern);
    if (matches) {
      content = content.replace(migration.pattern, migration.replace);
      changesMade += matches.length;
    }
  }

  if (changesMade > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return changesMade;
}

/**
 * Get all node files
 */
function getNodeFiles(dir) {
  const files = [];

  function walk(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Main migration
 */
function main() {
  const nodesDir = path.join(process.cwd(), 'lib', 'workflows', 'nodes', 'providers');
  const files = getNodeFiles(nodesDir);

  console.log('🚀 Starting automated visibility pattern migration...\n');

  let totalChanges = 0;
  let filesModified = 0;

  for (const file of files) {
    const changes = migrateFile(file);

    if (changes > 0) {
      console.log(`✅ ${path.relative(process.cwd(), file)}: ${changes} patterns migrated`);
      totalChanges += changes;
      filesModified++;
    }
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Patterns migrated: ${totalChanges}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log('\n⚠️  Please review changes and run tests!');
}

main();
