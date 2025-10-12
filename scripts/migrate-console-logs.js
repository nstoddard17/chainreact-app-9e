#!/usr/bin/env node

/**
 * Automated Console.log Migration Script
 *
 * Migrates console.log/error/warn statements to structured logger
 *
 * Usage: node scripts/migrate-console-logs.js [--dry-run] [--file=path/to/file.ts]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LOGGER_IMPORT = "import { logger } from '@/lib/utils/logger'";
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_FILE = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];

// Files to skip (logging infrastructure itself)
const SKIP_PATTERNS = [
  '/lib/utils/logger.ts',
  '/lib/logging/',
  '/scripts/',
  '/node_modules/',
  '/.next/',
  '/dist/',
  '/build/'
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
    // Stop at first non-import, non-comment line
    if (line && !line.startsWith('import ') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
      break;
    }
  }

  // Insert after last import or at the beginning
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, LOGGER_IMPORT);
  } else {
    // Add at the beginning if no imports found
    lines.unshift(LOGGER_IMPORT);
  }

  return lines.join('\n');
}

/**
 * Extract variable name from console statement context
 */
function extractContextFromStatement(beforeMatch) {
  // Look for common patterns like: const error =, if (error), catch (error)
  const errorMatch = beforeMatch.match(/\b(error|err|e|exception|failure|refreshError|updateError|fetchError|parseError)\b[^\w]*$/i);
  if (errorMatch) return errorMatch[1];

  return null;
}

/**
 * Convert console.log to logger.debug/trace
 */
function convertConsoleLog(match, fullLine, beforeMatch) {
  const isTrace = fullLine.includes('🔧') || fullLine.includes('🔍') || fullLine.includes('📡');
  const level = isTrace ? 'trace' : 'debug';

  // Extract message and arguments
  const argsMatch = match.match(/console\.log\((.*)\)/s);
  if (!argsMatch) return match;

  const args = argsMatch[1];

  // Handle template literals
  if (args.includes('`')) {
    // Convert `Message ${var}` to 'Message', { var }
    const templateMatch = args.match(/`([^`]*)`/);
    if (templateMatch) {
      const template = templateMatch[1];
      const vars = [...template.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1].trim());
      const message = template.replace(/\$\{[^}]+\}/g, '').trim();

      if (vars.length === 0) {
        return `logger.${level}('${message}')`;
      }

      const metadata = vars.map(v => {
        const key = v.split('.').pop();
        return `${key}: ${v}`;
      }).join(', ');

      return `logger.${level}('${message}', { ${metadata} })`;
    }
  }

  // Handle string + object pattern: console.log('Message:', obj)
  const parts = args.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const message = parts[0].replace(/['"]/g, '').replace(/[🔧🔍📡✅❌⚠️]/g, '').trim();
    const metadata = parts.slice(1).join(', ');
    return `logger.${level}('${message}', ${metadata})`;
  }

  // Simple string message
  const message = args.replace(/['"]/g, '').replace(/[🔧🔍📡✅❌⚠️]/g, '').trim();
  return `logger.${level}('${message}')`;
}

/**
 * Convert console.error to logger.error
 */
function convertConsoleError(match, fullLine, beforeMatch) {
  const argsMatch = match.match(/console\.error\((.*)\)/s);
  if (!argsMatch) return match;

  const args = argsMatch[1];
  const errorVar = extractContextFromStatement(beforeMatch);

  // Handle template literals
  if (args.includes('`')) {
    const templateMatch = args.match(/`([^`]*)`/);
    if (templateMatch) {
      const message = templateMatch[1].replace(/\$\{[^}]+\}/g, '').replace(/[❌]/g, '').trim();
      if (errorVar) {
        return `logger.error('${message}', { error: ${errorVar} instanceof Error ? ${errorVar}.message : String(${errorVar}) })`;
      }
      return `logger.error('${message}')`;
    }
  }

  // Handle string + error pattern: console.error('Message:', error)
  const parts = args.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const message = parts[0].replace(/['"]/g, '').replace(/[❌]/g, '').trim();
    const errorArg = parts[1];

    if (errorArg.match(/error|err|e\b/i)) {
      return `logger.error('${message}', { error: ${errorArg} instanceof Error ? ${errorArg}.message : String(${errorArg}) })`;
    }

    return `logger.error('${message}', { ${parts.slice(1).join(', ')} })`;
  }

  // Simple string message
  const message = args.replace(/['"]/g, '').replace(/[❌]/g, '').trim();
  return `logger.error('${message}')`;
}

/**
 * Convert console.warn to logger.warn
 */
function convertConsoleWarn(match, fullLine, beforeMatch) {
  const argsMatch = match.match(/console\.warn\((.*)\)/s);
  if (!argsMatch) return match;

  const args = argsMatch[1];

  // Similar to error handling
  if (args.includes('`')) {
    const templateMatch = args.match(/`([^`]*)`/);
    if (templateMatch) {
      const message = templateMatch[1].replace(/\$\{[^}]+\}/g, '').replace(/[⚠️]/g, '').trim();
      return `logger.warn('${message}')`;
    }
  }

  const parts = args.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const message = parts[0].replace(/['"]/g, '').replace(/[⚠️]/g, '').trim();
    return `logger.warn('${message}', { ${parts.slice(1).join(', ')} })`;
  }

  const message = args.replace(/['"]/g, '').replace(/[⚠️]/g, '').trim();
  return `logger.warn('${message}')`;
}

/**
 * Migrate console statements in file content
 */
function migrateContent(content, filePath) {
  let modified = content;
  let replacements = 0;

  // Add logger import
  modified = addLoggerImport(modified);

  // Track if import was added
  const importAdded = modified !== content;

  // Replace console.error
  const errorMatches = [...modified.matchAll(/console\.error\([^)]*\)/g)];
  errorMatches.forEach(match => {
    const beforeMatch = modified.substring(0, match.index);
    const fullLine = modified.substring(
      modified.lastIndexOf('\n', match.index) + 1,
      modified.indexOf('\n', match.index + match[0].length)
    );

    const replacement = convertConsoleError(match[0], fullLine, beforeMatch);
    if (replacement !== match[0]) {
      modified = modified.replace(match[0], replacement);
      replacements++;
    }
  });

  // Replace console.warn
  const warnMatches = [...modified.matchAll(/console\.warn\([^)]*\)/g)];
  warnMatches.forEach(match => {
    const beforeMatch = modified.substring(0, match.index);
    const fullLine = modified.substring(
      modified.lastIndexOf('\n', match.index) + 1,
      modified.indexOf('\n', match.index + match[0].length)
    );

    const replacement = convertConsoleWarn(match[0], fullLine, beforeMatch);
    if (replacement !== match[0]) {
      modified = modified.replace(match[0], replacement);
      replacements++;
    }
  });

  // Replace console.log
  const logMatches = [...modified.matchAll(/console\.log\([^)]*\)/g)];
  logMatches.forEach(match => {
    const beforeMatch = modified.substring(0, match.index);
    const fullLine = modified.substring(
      modified.lastIndexOf('\n', match.index) + 1,
      modified.indexOf('\n', match.index + match[0].length)
    );

    const replacement = convertConsoleLog(match[0], fullLine, beforeMatch);
    if (replacement !== match[0]) {
      modified = modified.replace(match[0], replacement);
      replacements++;
    }
  });

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
    if (!content.match(/console\.(log|error|warn)/)) {
      return;
    }

    stats.filesProcessed++;

    const { modified, replacements, wasModified } = migrateContent(content, filePath);

    if (wasModified) {
      stats.filesModified++;
      stats.statementsReplaced += replacements;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would modify: ${filePath} (${replacements} statements)`);
      } else {
        fs.writeFileSync(filePath, modified, 'utf8');
        console.log(`✅ Modified: ${filePath} (${replacements} statements)`);
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
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!shouldSkipFile(fullPath)) {
        findTsFiles(fullPath, fileList);
      }
    } else if ((item.endsWith('.ts') || item.endsWith('.tsx')) && !shouldSkipFile(fullPath)) {
      fileList.push(fullPath);
    }
  });

  return fileList;
}

/**
 * Find all TypeScript files with console statements
 */
function findFilesWithConsole(dir = process.cwd()) {
  const files = [];

  try {
    // Try ripgrep first (fastest)
    try {
      const output = execSync(
        `rg -t ts -t tsx --files-with-matches "console\\.(log|error|warn)" "${dir}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      output.split('\n').forEach(file => {
        if (file && !shouldSkipFile(file)) {
          files.push(file.trim());
        }
      });

      return files;
    } catch (rgError) {
      // Ripgrep not available, try grep
      try {
        const output = execSync(
          `grep -rl "console\\." --include="*.ts" --include="*.tsx" "${dir}"`,
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );

        output.split('\n').forEach(file => {
          if (file && !shouldSkipFile(file)) {
            files.push(file.trim());
          }
        });

        return files;
      } catch (grepError) {
        // Fall back to manual file search
        console.warn('⚠️ grep/rg not found, using manual file search (slower)...');
      }
    }

    // Manual fallback: find all TS files and check them
    const allTsFiles = findTsFiles(dir);
    console.log(`Checking ${allTsFiles.length} TypeScript files...`);

    allTsFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.match(/console\.(log|error|warn)/)) {
          files.push(file);
        }
      } catch (err) {
        // Skip files we can't read
      }
    });

  } catch (error) {
    console.error('Error finding files:', error.message);
  }

  return files;
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Starting console.log migration...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  let filesToProcess = [];

  if (SPECIFIC_FILE) {
    // Process specific file
    const fullPath = path.resolve(process.cwd(), SPECIFIC_FILE);
    if (fs.existsSync(fullPath)) {
      filesToProcess.push(fullPath);
    } else {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }
  } else {
    // Find all files with console statements
    console.log('📂 Scanning for files with console statements...');
    filesToProcess = findFilesWithConsole();
    console.log(`Found ${filesToProcess.length} files to process\n`);
  }

  // Process each file
  filesToProcess.forEach(processFile);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Files Processed:      ${stats.filesProcessed}`);
  console.log(`Files Modified:       ${stats.filesModified}`);
  console.log(`Statements Replaced:  ${stats.statementsReplaced}`);
  console.log(`Errors:               ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }

  console.log('='.repeat(60));
}

// Run the script
main();
