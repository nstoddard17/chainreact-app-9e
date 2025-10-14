import fs from 'fs';
import path from 'path';

let fixed = 0;

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

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Check if file has the problem: logger import before directive
  const loggerImportIdx = lines.findIndex(line => line.includes("from '@/lib/utils/logger'"));
  const directiveIdx = lines.findIndex(line =>
    line.trim() === '"use client"' ||
    line.trim() === "'use client'" ||
    line.trim() === '"use server"' ||
    line.trim() === "'use server'"
  );

  // If logger import comes before directive, fix it
  if (loggerImportIdx !== -1 && directiveIdx !== -1 && loggerImportIdx < directiveIdx) {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

    // Extract the directive and logger import lines
    const directiveLine = lines[directiveIdx];
    const loggerImportLine = lines[loggerImportIdx];

    // Remove both lines
    lines.splice(Math.max(loggerImportIdx, directiveIdx), 1);
    lines.splice(Math.min(loggerImportIdx, directiveIdx), 1);

    // Add directive first, then empty line, then logger import
    lines.unshift('');
    lines.unshift(loggerImportLine);
    lines.unshift('');
    lines.unshift(directiveLine);

    // Write back
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(`✅ Fixed: ${relativePath}`);
    fixed++;
  }
}

console.log('🔧 Fixing directive order issues...\n');

const files = findTsFiles(process.cwd());
files.forEach(fixFile);

console.log(`\n✅ Fixed ${fixed} files`);
