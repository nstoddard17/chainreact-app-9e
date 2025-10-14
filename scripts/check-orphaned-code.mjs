import fs from 'fs';
import path from 'path';

const issues = [];

function shouldSkipPath(relativePath) {
  return relativePath.includes('node_modules') ||
         relativePath.includes('.next') ||
         relativePath.includes('dist') ||
         relativePath.includes('build');
}

function findTsFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

    if (shouldSkipPath(relativePath)) return;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findTsFiles(fullPath, fileList);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const fileIssues = [];

  // Check for duplicate logger imports
  const loggerImports = lines.filter(line => line.includes("from '@/lib/utils/logger'"));
  if (loggerImports.length > 1) {
    fileIssues.push('Duplicate logger imports');
  }

  // Check for orphaned console statements (incomplete replacements)
  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Look for patterns that suggest incomplete replacement
    if (line.includes('logger.error(') && line.includes('console.')) {
      fileIssues.push(`Line ${idx + 1}: Mixed logger and console`);
    }

    // Check for remaining console statements (not in comments)
    if (trimmed.startsWith('console.') && !trimmed.startsWith('//')) {
      fileIssues.push(`Line ${idx + 1}: Remaining console statement: ${trimmed.substring(0, 60)}`);
    }
  });

  // Check for malformed logger calls
  if (content.includes('logger.error(console.') ||
      content.includes('logger.warn(console.') ||
      content.includes('logger.info(console.') ||
      content.includes('logger.debug(console.') ||
      content.includes('logger.trace(console.')) {
    fileIssues.push('Malformed logger call with console inside');
  }

  if (fileIssues.length > 0) {
    issues.push({ file: relativePath, issues: fileIssues });
  }
}

console.log('🔍 Scanning for orphaned code and issues...\n');

const files = findTsFiles(process.cwd());
console.log(`Found ${files.length} TypeScript files to check...\n`);

files.forEach(checkFile);

if (issues.length === 0) {
  console.log('✅ No issues found! All migrations appear clean.');
} else {
  console.log(`⚠️  Found issues in ${issues.length} files:\n`);
  issues.forEach(({ file, issues }) => {
    console.log(`📄 ${file}`);
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log('');
  });
}
