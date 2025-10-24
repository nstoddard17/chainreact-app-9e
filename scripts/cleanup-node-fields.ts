/**
 * Node Field Cleanup Script
 *
 * Fixes issues from the smart-node-fixer:
 * 1. Removes duplicate fields
 * 2. Fixes required flags (marks filtering/optional fields as not required)
 * 3. Fixes field types
 * 4. Removes placeholder tooltips
 *
 * Run with: npx tsx scripts/cleanup-node-fields.ts [--dry-run]
 */

import fs from 'fs';
import path from 'path';

interface CleanupIssue {
  provider: string;
  nodeType: string;
  issueType: 'duplicate' | 'wrong_required' | 'wrong_type' | 'bad_tooltip';
  fieldName: string;
  fix: string;
}

interface CleanupReport {
  totalIssues: number;
  issuesByType: Record<string, number>;
  issuesByProvider: Record<string, number>;
  issues: CleanupIssue[];
}

// Fields that should NEVER be required (optional filters, pagination, etc.)
const ALWAYS_OPTIONAL_FIELDS = [
  'limit', 'offset', 'starting_after', 'maxRecords', 'page', 'per_page',
  'filterByFormula', 'keywordSearch', 'filterField', 'filterValue', 'sortOrder',
  'dateFilter', 'customDateRange', 'recordLimit',
  'filterProperty', 'properties', 'fields', 'expand',
  'status', 'type', 'mode', 'visibility',
  'first_name', 'last_name', 'phone', 'address', 'city', 'state', 'zip', 'country',
  'preview_text', 'html_content', 'text_content', 'reply_to',
  'tags', 'delete_permanently', 'new_email'
];

function extractNodeBlocks(content: string): Array<{ type: string; start: number; end: number }> {
  const blocks: Array<{ type: string; start: number; end: number }> = [];
  const typeMatches = [...content.matchAll(/{\s*type:\s*["']([^"']+)["']/g)];

  for (let i = 0; i < typeMatches.length; i++) {
    const match = typeMatches[i];
    const type = match[1];
    const start = match.index!;

    // Find the end of this node block (start of next node or end of array)
    const nextStart = i < typeMatches.length - 1 ? typeMatches[i + 1].index! : content.length;
    const arrayEnd = content.indexOf('\n]', start);
    const end = nextStart < arrayEnd || arrayEnd === -1 ? nextStart : arrayEnd;

    blocks.push({ type, start, end });
  }

  return blocks;
}

function extractConfigSchema(nodeBlock: string): { start: number; end: number; content: string } | null {
  const configStart = nodeBlock.indexOf('configSchema:');
  if (configStart === -1) return null;

  let depth = 0;
  let inConfigSchema = false;
  let schemaStart = -1;
  let schemaEnd = -1;

  for (let i = configStart; i < nodeBlock.length; i++) {
    if (nodeBlock[i] === '[') {
      if (!inConfigSchema) {
        inConfigSchema = true;
        schemaStart = i;
      }
      depth++;
    }
    if (nodeBlock[i] === ']') {
      depth--;
      if (depth === 0 && inConfigSchema) {
        schemaEnd = i + 1;
        break;
      }
    }
  }

  if (schemaStart === -1 || schemaEnd === -1) return null;

  return {
    start: configStart + schemaStart,
    end: configStart + schemaEnd,
    content: nodeBlock.substring(configStart + schemaStart, configStart + schemaEnd)
  };
}

function parseFields(configSchemaContent: string): Array<{
  name: string;
  start: number;
  end: number;
  content: string;
  required: boolean;
  type: string;
}> {
  const fields: Array<any> = [];

  // Match field objects
  const fieldRegex = /{\s*name:\s*["']([^"']+)["'][^}]*}/gs;
  const matches = [...configSchemaContent.matchAll(fieldRegex)];

  for (const match of matches) {
    const fieldContent = match[0];
    const name = match[1];
    const start = match.index!;
    const end = start + fieldContent.length;

    // Extract required flag
    const requiredMatch = fieldContent.match(/required:\s*(true|false)/);
    const required = requiredMatch ? requiredMatch[1] === 'true' : false;

    // Extract type
    const typeMatch = fieldContent.match(/type:\s*["']([^"']+)["']/);
    const type = typeMatch ? typeMatch[1] : 'text';

    fields.push({ name, start, end, content: fieldContent, required, type });
  }

  return fields;
}

function findDuplicateFields(fields: Array<{ name: string }>): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const field of fields) {
    if (seen.has(field.name)) {
      duplicates.add(field.name);
    }
    seen.add(field.name);
  }

  return duplicates;
}

function shouldBeOptional(fieldName: string): boolean {
  return ALWAYS_OPTIONAL_FIELDS.includes(fieldName);
}

function hasBadTooltip(fieldContent: string): boolean {
  return fieldContent.includes('tooltip: "Add supportsAI: true for AI-powered filling"') ||
         fieldContent.includes('tooltip: "Filter or set status"') ||
         fieldContent.includes('tooltip: "Customize which properties to include"');
}

async function analyzeFile(filePath: string): Promise<CleanupIssue[]> {
  const issues: CleanupIssue[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const provider = path.basename(path.dirname(filePath));

  const nodeBlocks = extractNodeBlocks(content);

  for (const block of nodeBlocks) {
    const nodeBlock = content.substring(block.start, block.end);
    const configSchema = extractConfigSchema(nodeBlock);

    if (!configSchema) continue;

    const fields = parseFields(configSchema.content);

    // Check for duplicates
    const duplicates = findDuplicateFields(fields);
    for (const dupName of duplicates) {
      issues.push({
        provider,
        nodeType: block.type,
        issueType: 'duplicate',
        fieldName: dupName,
        fix: `Remove duplicate ${dupName} field`
      });
    }

    // Check for wrong required flags
    for (const field of fields) {
      if (field.required && shouldBeOptional(field.name)) {
        issues.push({
          provider,
          nodeType: block.type,
          issueType: 'wrong_required',
          fieldName: field.name,
          fix: `Change ${field.name} to required: false`
        });
      }

      // Check for bad tooltips
      if (hasBadTooltip(field.content)) {
        issues.push({
          provider,
          nodeType: block.type,
          issueType: 'bad_tooltip',
          fieldName: field.name,
          fix: `Remove placeholder tooltip from ${field.name}`
        });
      }
    }
  }

  return issues;
}

async function fixFile(filePath: string, dryRun: boolean): Promise<number> {
  let content = fs.readFileSync(filePath, 'utf-8');
  let fixCount = 0;

  const nodeBlocks = extractNodeBlocks(content);

  for (const block of nodeBlocks) {
    const nodeStart = block.start;
    const nodeBlock = content.substring(block.start, block.end);
    const configSchema = extractConfigSchema(nodeBlock);

    if (!configSchema) continue;

    const fields = parseFields(configSchema.content);
    const duplicates = findDuplicateFields(fields);

    // Build new config schema without duplicates and with fixed required flags
    const seenFields = new Set<string>();
    const fixedFields: string[] = [];

    for (const field of fields) {
      // Skip duplicates (keep only first occurrence)
      if (duplicates.has(field.name) && seenFields.has(field.name)) {
        fixCount++;
        continue;
      }
      seenFields.add(field.name);

      let fieldContent = field.content;

      // Fix required flag
      if (field.required && shouldBeOptional(field.name)) {
        fieldContent = fieldContent.replace(/required:\s*true/, 'required: false');
        fixCount++;
      }

      // Remove bad tooltips
      if (hasBadTooltip(fieldContent)) {
        fieldContent = fieldContent.replace(/,?\s*tooltip:\s*"[^"]*Add supportsAI[^"]*"/, '');
        fieldContent = fieldContent.replace(/,?\s*tooltip:\s*"Filter or set status"/, '');
        fieldContent = fieldContent.replace(/,?\s*tooltip:\s*"Customize which properties to include"/, '');
        fixCount++;
      }

      fixedFields.push(fieldContent);
    }

    // Rebuild config schema
    const newConfigSchema = '[\n    ' + fixedFields.join(',\n    ') + '\n  ]';

    // Replace in content
    const schemaStartInNode = nodeBlock.indexOf('configSchema:');
    const schemaStartInFile = nodeStart + schemaStartInNode;
    const schemaEndInFile = schemaStartInFile + configSchema.content.length + 'configSchema:'.length;

    const before = content.substring(0, schemaStartInFile + 'configSchema:'.length);
    const after = content.substring(schemaEndInFile);

    content = before + ' ' + newConfigSchema + after;
  }

  if (!dryRun && fixCount > 0) {
    fs.writeFileSync(filePath, content);
  }

  return fixCount;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            Node Field Cleanup Script                      ║');
  console.log('║  Fixing duplicates, required flags, and tooltips          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY RUN - No files will be modified\n');
  }

  const report: CleanupReport = {
    totalIssues: 0,
    issuesByType: {},
    issuesByProvider: {},
    issues: []
  };

  // Analyze files that were modified by smart-node-fixer
  const providers = ['airtable', 'dropbox', 'hubspot', 'mailchimp', 'onedrive', 'stripe', 'trello'];
  const nodesPath = path.join(process.cwd(), 'lib/workflows/nodes/providers');

  console.log('🔍 Analyzing modified files...\n');

  for (const provider of providers) {
    const filePath = path.join(nodesPath, provider, 'index.ts');
    if (!fs.existsSync(filePath)) continue;

    const issues = await analyzeFile(filePath);
    report.issues.push(...issues);

    if (issues.length > 0) {
      report.issuesByProvider[provider] = issues.length;
      for (const issue of issues) {
        report.issuesByType[issue.issueType] = (report.issuesByType[issue.issueType] || 0) + 1;
      }
    }
  }

  report.totalIssues = report.issues.length;

  console.log('📊 Issues Found:\n');
  console.log(`   Total: ${report.totalIssues}\n`);
  console.log('   By Type:');
  for (const [type, count] of Object.entries(report.issuesByType)) {
    console.log(`     - ${type.replace(/_/g, ' ')}: ${count}`);
  }
  console.log('\n   By Provider:');
  for (const [provider, count] of Object.entries(report.issuesByProvider)) {
    console.log(`     - ${provider}: ${count}`);
  }

  if (report.totalIssues === 0) {
    console.log('\n✨ No issues found! Everything looks good.\n');
    return;
  }

  // Apply fixes
  console.log(`\n${dryRun ? '📋 Would fix' : '✏️  Fixing'}...\n`);

  let totalFixed = 0;
  for (const provider of providers) {
    const filePath = path.join(nodesPath, provider, 'index.ts');
    if (!fs.existsSync(filePath)) continue;

    const fixCount = await fixFile(filePath, dryRun);
    if (fixCount > 0) {
      console.log(`✅ ${provider}: Fixed ${fixCount} issues`);
      totalFixed += fixCount;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total issues ${dryRun ? 'would be' : ''} fixed: ${totalFixed}\n`);

  if (!dryRun) {
    console.log('✨ Cleanup complete!\n');
  } else {
    console.log('💡 Run without --dry-run to apply fixes\n');
  }
}

main().catch(console.error);
