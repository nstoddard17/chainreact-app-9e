import fs from 'fs';
import path from 'path';

const LOGGER_IMPORT = "import { logger } from '@/lib/utils/logger'";
let stats = { scanned: 0, modified: 0, statements: 0, errors: 0 };

function shouldSkipFile(relativePath) {
  return relativePath.includes('node_modules') ||
         relativePath.includes('.next') ||
         relativePath.includes('dist') ||
         relativePath.includes('build') ||
         relativePath.includes('scripts') ||
         relativePath === 'lib/utils/logger.ts' ||
         relativePath === 'lib/logging/backendLogger.ts' ||
         relativePath === 'lib/logging/consoleDeduplicator.ts' ||
         relativePath === 'lib/logging/fileLogger.ts' ||
         relativePath === 'lib/logging/initLogging.ts';
}

function findTsFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    if (shouldSkipFile(relativePath)) return;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findTsFiles(fullPath, fileList);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

function hasConsoleStatements(content) {
  return content.includes('console.error(') ||
         content.includes('console.warn(') ||
         content.includes('console.log(') ||
         content.includes('console.info(');
}

function addLoggerImport(content) {
  // Skip if already has logger import
  if (content.includes(LOGGER_IMPORT) || content.includes("from '@/lib/utils/logger'")) {
    return content;
  }

  const lines = content.split('\n');

  // Find directives (use client/use server)
  let directiveIdx = -1;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '"use client"' || trimmed === "'use client'" ||
        trimmed === '"use server"' || trimmed === "'use server'"  ) {
      directiveIdx = i;
      break;
    }
  }

  // Find last import statement
  let lastImportIdx = -1;
  let inMultiLineImport = false;

  for (let i = directiveIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track multi-line imports
    if (line.startsWith('import ') && line.includes('{') && !line.includes('}')) {
      inMultiLineImport = true;
      lastImportIdx = i;
      continue;
    }

    if (inMultiLineImport) {
      lastImportIdx = i;
      if (line.includes('}')) {
        inMultiLineImport = false;
      }
      continue;
    }

    // Single line import
    if (line.startsWith('import ') && !line.includes('type {')) {
      lastImportIdx = i;
    }

    // Stop at first non-import, non-comment, non-empty line
    if (line &&
        !line.startsWith('import ') &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*') &&
        !line.startsWith('*/')) {
      break;
    }
  }

  // Insert logger import after last import (or after directive if no imports)
  const insertIdx = lastImportIdx >= 0 ? lastImportIdx + 1 : directiveIdx + 1;

  if (insertIdx > 0) {
    lines.splice(insertIdx, 0, '', LOGGER_IMPORT);
  } else {
    // No directive, no imports - add at top
    lines.unshift(LOGGER_IMPORT, '');
  }

  return lines.join('\n');
}

function replaceConsoleStatements(content) {
  let modified = content;
  let count = 0;

  // Replace console.error
  const errorMatches = modified.match(/console\.error\(/g);
  if (errorMatches) count += errorMatches.length;
  modified = modified.replace(/console\.error\(/g, 'logger.error(');

  // Replace console.warn
  const warnMatches = modified.match(/console\.warn\(/g);
  if (warnMatches) count += warnMatches.length;
  modified = modified.replace(/console\.warn\(/g, 'logger.warn(');

  // Replace console.log
  const logMatches = modified.match(/console\.log\(/g);
  if (logMatches) count += logMatches.length;
  modified = modified.replace(/console\.log\(/g, 'logger.debug(');

  // Replace console.info
  const infoMatches = modified.match(/console\.info\(/g);
  if (infoMatches) count += infoMatches.length;
  modified = modified.replace(/console\.info\(/g, 'logger.info(');

  return { modified, count };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

    stats.scanned++;

    if (!hasConsoleStatements(content)) {
      return;
    }

    // Replace console statements
    const { modified, count } = replaceConsoleStatements(content);

    // Add logger import
    const final = addLoggerImport(modified);

    // Write back
    fs.writeFileSync(filePath, final, 'utf8');

    stats.modified++;
    stats.statements += count;
    console.log(`✅ Modified: ${relativePath} (${count} statements)`);
  } catch (error) {
    stats.errors++;
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

console.log('🚀 Starting console.log migration...\n');

const files = findTsFiles(process.cwd());
console.log(`📂 Found ${files.length} TypeScript files\n`);

files.forEach(processFile);

console.log('\n' + '='.repeat(60));
console.log('📊 Migration Summary');
console.log('='.repeat(60));
console.log(`Files Scanned:        ${stats.scanned}`);
console.log(`Files Modified:       ${stats.modified}`);
console.log(`Statements Replaced:  ${stats.statements}`);
console.log(`Errors:               ${stats.errors}`);
console.log('='.repeat(60));
