#!/usr/bin/env node

/**
 * Automated Console.log Migration Script
 *
 * Migrates console.log/error/warn statements to structured logger
 *
 * Usage: node scripts/migrate-console-logs.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LOGGER_IMPORT = "import { logger } from '@/lib/utils/logger'";
const DRY_RUN = process.argv.includes('--dry-run');

// Files to skip (logging infrastructure itself)
const SKIP_PATTERNS = [
  'lib\\utils\\logger.ts',
  'lib/utils/logger.ts',
  'lib\\logging\\',
  'lib/logging/',
  'scripts\\',
  'scripts/',
  'node_modules\\',
  'node_modules/',
  '.next\\',
  '.next/',
  'dist\\',
  'dist/',
  'build\\',
  'build/'
];

// Statistics
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  statementsReplaced: 0,
  errors: []
};

/**
 * Check if file should be skipped
 */
function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

/**
 * Add logger import if not present
 */
function addLoggerImport(content) {
  // Check if import already exists
  if (content.includes(LOGGER_IMPORT) || content.includes("from '@/lib/utils/logger'")) {
    return content;
  }

  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('import ') && !line.includes('type {')) {
      lastImportIndex = i;
    }
    // Stop at first non-import, non-comment, non-empty line
    if (line &&
        !line.startsWith('import ') &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*') &&
        !line.startsWith('/**') &&
        line !== '') {
      break;
    }
  }

  // Insert after last import or at the beginning
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, LOGGER_IMPORT);
  } else {
    // Find first non-comment line
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, LOGGER_IMPORT);
  }

  return lines.join('\n');
}

/**
 * Simple replacement for console statements
 */
function migrateContent(content) {
  let modified = content;
  let replacements = 0;

  // Add logger import
  const beforeImport = modified;
  modified = addLoggerImport(modified);
  const importAdded = modified !== beforeImport;

  // Replace console.error with logger.error
  const errorRegex = /console\.error\(/g;
  const errorCount = (modified.match(errorRegex) || []).length;
  modified = modified.replace(errorRegex, 'logger.error(');
  replacements += errorCount;

  // Replace console.warn with logger.warn
  const warnRegex = /console\.warn\(/g;
  const warnCount = (modified.match(warnRegex) || []).length;
  modified = modified.replace(warnRegex, 'logger.warn(');
  replacements += warnCount;

  // Replace console.log with logger.debug
  const logRegex = /console\.log\(/g;
  const logCount = (modified.match(logRegex) || []).length;
  modified = modified.replace(logRegex, 'logger.debug(');
  replacements += logCount;

  // Replace console.info with logger.info
  const infoRegex = /console\.info\(/g;
  const infoCount = (modified.match(infoRegex) || []).length;
  modified = modified.replace(infoRegex, 'logger.info(');
  replacements += infoCount;

  const wasModified = importAdded || replacements > 0;

  return { modified, replacements, wasModified };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Skip if no console statements
    if (!content.match(/console\.(log|error|warn|info|debug)/)) {
      return;
    }

    stats.filesProcessed++;

    const { modified, replacements, wasModified } = migrateContent(content);

    if (wasModified) {
      stats.filesModified++;
      stats.statementsReplaced += replacements;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would modify: ${path.relative(process.cwd(), filePath)} (${replacements} statements)`);
      } else {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ Modified: ${path.relative(process.cwd(), filePath)} (${replacements} statements)`);
      }
    }
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively find TypeScript files
 */
function findTsFiles(dir, fileList = []) {
  try {
    const items = fs.readdirSync(dir);

    items.forEach(item => {
      const fullPath = path.join(dir, item);

      if (shouldSkipFile(fullPath)) {
        return;
      }

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          findTsFiles(fullPath, fileList);
        } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
          fileList.push(fullPath);
        }
      } catch (err) {
        // Skip files we can't stat
      }
    });
  } catch (err) {
    // Skip directories we can't read
  }

  return fileList;
}

/**
 * Find all TypeScript files with console statements
 */
function findFilesWithConsole() {
  console.log('📂 Finding all TypeScript files...');
  const allTsFiles = findTsFiles(process.cwd());
  console.log(`   Found ${allTsFiles.length} TypeScript files`);

  console.log('🔍 Checking for console statements...');
  const filesWithConsole = [];

  let checked = 0;
  allTsFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.match(/console\.(log|error|warn|info|debug)/)) {
        filesWithConsole.push(file);
      }
      checked++;
      if (checked % 100 === 0) {
        process.stdout.write(`\r   Checked ${checked}/${allTsFiles.length} files...`);
      }
    } catch (err) {
      // Skip files we can't read
    }
  });

  process.stdout.write(`\r   Checked ${checked}/${allTsFiles.length} files    \n`);

  return filesWithConsole;
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Starting console.log migration...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  // Find all files with console statements
  const filesToProcess = findFilesWithConsole();
  console.log(`\n📝 Found ${filesToProcess.length} files with console statements\n`);

  if (filesToProcess.length === 0) {
    console.log('✅ No files found with console statements!');
    return;
  }

  // Process each file
  const startTime = Date.now();
  filesToProcess.forEach((file, index) => {
    if ((index + 1) % 50 === 0) {
      console.log(`   Processing: ${index + 1}/${filesToProcess.length}...`);
    }
    processFile(file);
  });
  const endTime = Date.now();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Files Scanned:        ${filesToProcess.length}`);
  console.log(`Files Processed:      ${stats.filesProcessed}`);
  console.log(`Files Modified:       ${stats.filesModified}`);
  console.log(`Statements Replaced:  ${stats.statementsReplaced}`);
  console.log(`Errors:               ${stats.errors.length}`);
  console.log(`Time Elapsed:         ${((endTime - startTime) / 1000).toFixed(2)}s`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.slice(0, 10).forEach(({ file, error }) => {
      console.log(`  - ${path.relative(process.cwd(), file)}: ${error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more errors`);
    }
  }

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Migration complete! Run `npm run build` to check for errors.');
  }

  console.log('='.repeat(60));
}

// Run the script
main();
