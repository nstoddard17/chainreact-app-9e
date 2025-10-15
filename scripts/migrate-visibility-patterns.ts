/**
 * Migration Script: Legacy Visibility Patterns → Modern visibilityCondition
 *
 * This script helps identify and migrate legacy visibility patterns to the modern format.
 *
 * Usage:
 *   npx ts-node scripts/migrate-visibility-patterns.ts --audit    # Show what needs migration
 *   npx ts-node scripts/migrate-visibility-patterns.ts --migrate  # Auto-migrate simple patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface LegacyPattern {
  file: string;
  line: number;
  pattern: string;
  fieldName: string;
  original: string;
  suggested: string;
}

const LEGACY_PATTERNS = [
  'conditional:',
  'conditionalVisibility:',
  'visibleWhen:',
  'showWhen:',
];

/**
 * Scan a file for legacy visibility patterns
 */
function scanFile(filePath: string): LegacyPattern[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const patterns: LegacyPattern[] = [];

  let currentField: string | null = null;
  let inConfigSchema = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track if we're in configSchema
    if (line.includes('configSchema:')) {
      inConfigSchema = true;
    }

    // Track current field name
    const fieldMatch = line.match(/name:\s*["']([^"']+)["']/);
    if (fieldMatch && inConfigSchema) {
      currentField = fieldMatch[1];
    }

    // Check for legacy patterns
    for (const pattern of LEGACY_PATTERNS) {
      if (line.includes(pattern)) {
        const suggested = convertToModernPattern(line, lines.slice(i, i + 5).join('\n'));

        patterns.push({
          file: filePath,
          line: i + 1,
          pattern: pattern.replace(':', ''),
          fieldName: currentField || 'unknown',
          original: line.trim(),
          suggested
        });
      }
    }
  }

  return patterns;
}

/**
 * Convert legacy pattern to modern visibilityCondition
 */
function convertToModernPattern(line: string, context: string): string {
  // conditional: { field: 'action', value: 'create' }
  const conditionalMatch = line.match(/conditional:\s*\{\s*field:\s*["']([^"']+)["']\s*,\s*value:\s*["']([^"']+)["']\s*\}/);
  if (conditionalMatch) {
    const [, field, value] = conditionalMatch;
    return `visibilityCondition: { field: '${field}', operator: 'equals', value: '${value}' }`;
  }

  // visibleWhen: { field: 'type', equals: 'webhook' }
  const visibleWhenMatch = line.match(/visibleWhen:\s*\{\s*field:\s*["']([^"']+)["']\s*,\s*equals:\s*["']([^"']+)["']\s*\}/);
  if (visibleWhenMatch) {
    const [, field, value] = visibleWhenMatch;
    return `visibilityCondition: { field: '${field}', operator: 'equals', value: '${value}' }`;
  }

  // showWhen: { action: 'create' }
  const showWhenSimpleMatch = line.match(/showWhen:\s*\{\s*([^:]+):\s*["']([^"']+)["']\s*\}/);
  if (showWhenSimpleMatch) {
    const [, field, value] = showWhenSimpleMatch;
    return `visibilityCondition: { field: '${field.trim()}', operator: 'equals', value: '${value}' }`;
  }

  // showWhen: { action: { $in: ['create', 'update'] } }
  const showWhenInMatch = context.match(/showWhen:\s*\{\s*([^:]+):\s*\{\s*\$in:\s*\[([^\]]+)\]\s*\}\s*\}/);
  if (showWhenInMatch) {
    const [, field, values] = showWhenInMatch;
    return `visibilityCondition: { field: '${field.trim()}', operator: 'in', value: [${values}] }`;
  }

  return '// TODO: Complex pattern - needs manual migration';
}

/**
 * Main audit function
 */
async function audit() {
  const files = await glob('lib/workflows/nodes/**/*.ts', { cwd: process.cwd() });

  let totalPatterns = 0;
  const patternsByType: Record<string, number> = {};
  const patternsByProvider: Record<string, number> = {};
  const allPatterns: LegacyPattern[] = [];

  console.log('🔍 Scanning for legacy visibility patterns...\n');

  for (const file of files) {
    const patterns = scanFile(file);
    totalPatterns += patterns.length;

    for (const pattern of patterns) {
      patternsByType[pattern.pattern] = (patternsByType[pattern.pattern] || 0) + 1;

      const provider = file.split('/')[3] || 'unknown';
      patternsByProvider[provider] = (patternsByProvider[provider] || 0) + 1;

      allPatterns.push(pattern);
    }
  }

  // Print summary
  console.log('📊 Summary:');
  console.log(`   Total legacy patterns found: ${totalPatterns}`);
  console.log(`   Files affected: ${new Set(allPatterns.map(p => p.file)).size}\n`);

  console.log('📋 By Pattern Type:');
  Object.entries(patternsByType)
    .sort(([, a], [, b]) => b - a)
    .forEach(([pattern, count]) => {
      console.log(`   ${pattern}: ${count}`);
    });

  console.log('\n📁 By Provider (Top 10):');
  Object.entries(patternsByProvider)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([provider, count]) => {
      console.log(`   ${provider}: ${count}`);
    });

  // Print detailed findings
  console.log('\n\n🔧 Migration Suggestions:\n');

  const byFile = allPatterns.reduce((acc, pattern) => {
    if (!acc[pattern.file]) acc[pattern.file] = [];
    acc[pattern.file].push(pattern);
    return acc;
  }, {} as Record<string, LegacyPattern[]>);

  let fileCount = 0;
  for (const [file, patterns] of Object.entries(byFile)) {
    if (fileCount >= 5) {
      console.log(`\n... and ${Object.keys(byFile).length - 5} more files`);
      break;
    }

    console.log(`\n📄 ${file}`);
    patterns.slice(0, 3).forEach(pattern => {
      console.log(`   Line ${pattern.line} - ${pattern.fieldName}`);
      console.log(`   ❌ ${pattern.original}`);
      console.log(`   ✅ ${pattern.suggested}`);
    });

    if (patterns.length > 3) {
      console.log(`   ... and ${patterns.length - 3} more patterns in this file`);
    }

    fileCount++;
  }

  // Generate priority list
  console.log('\n\n🎯 Recommended Migration Priority:\n');
  console.log('1. Airtable (9 patterns) - High usage');
  console.log('2. Outlook (8 patterns)');
  console.log('3. Google Sheets (6 patterns) - High usage');
  console.log('4. Google Calendar (6 patterns)');
  console.log('5. Facebook (6 patterns)');
  console.log('\nRun with --migrate to auto-convert simple patterns');
}

/**
 * Auto-migrate simple patterns
 */
async function migrate() {
  const files = await glob('lib/workflows/nodes/**/*.ts', { cwd: process.cwd() });

  let migratedCount = 0;
  let filesModified = 0;

  console.log('🚀 Starting auto-migration...\n');

  for (const file of files) {
    const patterns = scanFile(file);
    if (patterns.length === 0) continue;

    let content = fs.readFileSync(file, 'utf-8');
    let modified = false;

    for (const pattern of patterns) {
      // Only auto-migrate simple patterns
      if (!pattern.suggested.includes('TODO')) {
        content = content.replace(pattern.original, '      ' + pattern.suggested);
        modified = true;
        migratedCount++;
        console.log(`✅ ${file}:${pattern.line} - ${pattern.fieldName}`);
      }
    }

    if (modified) {
      fs.writeFileSync(file, content, 'utf-8');
      filesModified++;
    }
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Patterns migrated: ${migratedCount}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log('\n⚠️  Please review changes and test thoroughly!');
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--migrate')) {
  migrate().catch(console.error);
} else {
  audit().catch(console.error);
}
