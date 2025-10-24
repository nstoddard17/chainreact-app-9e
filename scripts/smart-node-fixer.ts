/**
 * Smart Node Configuration Fixer
 *
 * This script:
 * 1. Detects missing fields in node schemas
 * 2. Analyzes handler code to infer proper field types
 * 3. Suggests dynamic field configurations
 * 4. Generates automated fixes + TODO roadmap
 * 5. Applies fixes with user approval
 *
 * Run with: npx tsx scripts/smart-node-fixer.ts [--dry-run] [--provider=name]
 */

import fs from 'fs';
import path from 'path';

interface FieldAnalysis {
  name: string;
  currentlyInSchema: boolean;
  usedInHandler: boolean;
  inferredType: 'text' | 'number' | 'boolean' | 'select' | 'array' | 'object' | 'email' | 'file';
  required: boolean;
  shouldBeDynamic: boolean;
  dynamicType?: string;
  suggestions: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface NodeFix {
  provider: string;
  nodeType: string;
  nodeTitle: string;
  filePath: string;
  handlerPath: string;
  missingFields: FieldAnalysis[];
  improvements: {
    field: string;
    current: string;
    suggested: string;
    reason: string;
  }[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface FixReport {
  totalNodes: number;
  nodesWithIssues: number;
  criticalFixes: number;
  fieldsToAdd: number;
  improvementsSuggested: number;
  fixes: NodeFix[];
  summary: {
    byProvider: Record<string, { critical: number; high: number; medium: number; low: number }>;
    byPriority: Record<string, number>;
  };
}

// Patterns for inferring field types from handler code
const FIELD_TYPE_PATTERNS = {
  email: [/email/i, /@/, /recipient/i, /sender/i],
  number: [/limit/i, /count/i, /max/i, /min/i, /amount/i, /quantity/i, /\.parseInt\(/, /Number\(/],
  boolean: [/enabled?/i, /disabled?/i, /active/i, /\.boolean/i, /true\|false/],
  array: [/\.map\(/, /\.filter\(/, /\.forEach\(/, /\[\]/],
  object: [/JSON\.parse/, /\{[^}]+\}/],
  select: [/status/i, /type/i, /mode/i, /visibility/i, /priority/i],
  file: [/file/i, /upload/i, /attachment/i, /document/i],
};

// Patterns for detecting dynamic fields
const DYNAMIC_FIELD_PATTERNS = {
  'provider-bases': [/base_?id/i, /workspace_?id/i],
  'provider-tables': [/table_?id/i, /table_?name/i],
  'provider-lists': [/list_?id/i, /audience_?id/i],
  'provider-channels': [/channel_?id/i],
  'provider-folders': [/folder_?id/i, /directory/i],
  'provider-boards': [/board_?id/i],
  'provider-projects': [/project_?id/i],
  'provider-databases': [/database_?id/i],
  'provider-pages': [/page_?id/i],
  'provider-calendars': [/calendar_?id/i],
};

// Common field patterns
const COMMON_FIELD_INFO = {
  limit: { type: 'number', label: 'Maximum Results', defaultValue: 100, tooltip: 'Number of results to retrieve' },
  offset: { type: 'number', label: 'Offset', defaultValue: 0, tooltip: 'Starting position for pagination' },
  starting_after: { type: 'text', label: 'Starting After', tooltip: 'Cursor for pagination' },
  properties: { type: 'array', label: 'Properties to Retrieve', tooltip: 'Customize which properties to include' },
  fields: { type: 'array', label: 'Fields', tooltip: 'Specify which fields to include/update' },
  status: { type: 'select', label: 'Status', tooltip: 'Filter or set status' },
};

function analyzeHandlerCode(handlerCode: string, fieldName: string): FieldAnalysis {
  const analysis: FieldAnalysis = {
    name: fieldName,
    currentlyInSchema: false,
    usedInHandler: true,
    inferredType: 'text',
    required: false,
    shouldBeDynamic: false,
    suggestions: [],
    confidence: 'medium',
  };

  // Extract the field usage context (surrounding code)
  const fieldRegex = new RegExp(`config\\.${fieldName}[^\\w].*`, 'g');
  const usages = handlerCode.match(fieldRegex) || [];
  const context = usages.join(' ');

  // Infer type from patterns
  for (const [type, patterns] of Object.entries(FIELD_TYPE_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(context) || pattern.test(fieldName))) {
      analysis.inferredType = type as any;
      break;
    }
  }

  // Check if required (no fallback/default value)
  const hasDefault = context.includes('||') || context.includes('??');
  const hasTernary = context.includes('?');
  const hasOptionalChaining = context.includes('?.');
  analysis.required = !hasDefault && !hasTernary && !hasOptionalChaining;

  // Check if should be dynamic
  for (const [dynamicType, patterns] of Object.entries(DYNAMIC_FIELD_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(fieldName))) {
      analysis.shouldBeDynamic = true;
      analysis.dynamicType = dynamicType;
      analysis.suggestions.push(`Make this a dynamic dropdown using ${dynamicType}`);
      break;
    }
  }

  // Add AI support suggestion
  if (!['file', 'array', 'object'].includes(analysis.inferredType)) {
    analysis.suggestions.push('Add supportsAI: true for AI-powered filling');
  }

  // Pagination fields should always be optional
  if (['limit', 'offset', 'starting_after', 'page'].includes(fieldName)) {
    analysis.required = false;
    analysis.suggestions.push('Pagination field - should be optional with sensible default');
  }

  // Check confidence level
  if (analysis.shouldBeDynamic || usages.length > 3) {
    analysis.confidence = 'high';
  } else if (usages.length === 1 && !hasDefault) {
    analysis.confidence = 'low';
  }

  return analysis;
}

function extractHandlerFields(handlerCode: string): string[] {
  const fields: string[] = [];

  // Match config.fieldName patterns
  const dotMatches = handlerCode.matchAll(/config\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const match of dotMatches) {
    fields.push(match[1]);
  }

  // Match config['field_name'] patterns
  const bracketMatches = handlerCode.matchAll(/config\[['"]([^'"]+)['"]\]/g);
  for (const match of bracketMatches) {
    fields.push(match[1]);
  }

  return [...new Set(fields)];
}

function extractSchemaFields(nodeContent: string, nodeType: string): Set<string> {
  const fields = new Set<string>();

  const nodeDefStart = nodeContent.indexOf(`type: "${nodeType}"`);
  if (nodeDefStart === -1) return fields;

  const configSchemaStart = nodeContent.indexOf('configSchema:', nodeDefStart);
  if (configSchemaStart === -1) return fields;

  const nextNodeStart = nodeContent.indexOf('type:', configSchemaStart + 20);
  const endOfArray = nodeContent.indexOf(']', configSchemaStart);
  const nodeDefEnd = nextNodeStart !== -1 && nextNodeStart < endOfArray ? nextNodeStart : endOfArray;

  const configBlock = nodeContent.substring(configSchemaStart, nodeDefEnd);

  const fieldMatches = configBlock.matchAll(/name:\s*["']([^"']+)["']/g);
  for (const match of fieldMatches) {
    fields.add(match[1]);
  }

  return fields;
}

function getNodeInfo(nodeContent: string, nodeType: string): { title: string; startIndex: number; endIndex: number } {
  const nodeDefStart = nodeContent.indexOf(`type: "${nodeType}"`);
  if (nodeDefStart === -1) return { title: nodeType, startIndex: -1, endIndex: -1 };

  const titleMatch = nodeContent.substring(nodeDefStart, nodeDefStart + 300).match(/title:\s*["']([^"']+)["']/);
  const title = titleMatch ? titleMatch[1] : nodeType;

  // Find the end of this node definition
  const nextNodeStart = nodeContent.indexOf('\n  {', nodeDefStart + 100);
  const arrayEnd = nodeContent.indexOf('\n]', nodeDefStart);
  const endIndex = nextNodeStart !== -1 && nextNodeStart < arrayEnd ? nextNodeStart : arrayEnd;

  return { title, startIndex: nodeDefStart, endIndex };
}

function findConfigSchemaEnd(nodeContent: string, startIndex: number): number {
  let depth = 0;
  let inConfigSchema = false;

  for (let i = startIndex; i < nodeContent.length; i++) {
    if (nodeContent.substring(i, i + 13) === 'configSchema:') {
      inConfigSchema = true;
      continue;
    }

    if (inConfigSchema) {
      if (nodeContent[i] === '[') depth++;
      if (nodeContent[i] === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }

  return -1;
}

async function getHandlerPath(nodeType: string): Promise<{ exists: boolean; path?: string; code?: string }> {
  const parts = nodeType.split('_');
  if (parts.length < 3) return { exists: false };

  const provider = parts[0];
  const isTrigger = parts[1] === 'trigger';
  const actionName = parts.slice(2).join('_');

  const handlerDir = isTrigger ? 'triggers' : 'actions';

  // Try snake_case first
  let handlerPath = path.join(
    process.cwd(),
    'lib/workflows',
    handlerDir,
    provider,
    `${actionName}.ts`
  );

  if (fs.existsSync(handlerPath)) {
    const code = fs.readFileSync(handlerPath, 'utf-8');
    return { exists: true, path: handlerPath, code };
  }

  // Try camelCase
  const camelCaseName = actionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  handlerPath = path.join(
    process.cwd(),
    'lib/workflows',
    handlerDir,
    provider,
    `${camelCaseName}.ts`
  );

  if (fs.existsSync(handlerPath)) {
    const code = fs.readFileSync(handlerPath, 'utf-8');
    return { exists: true, path: handlerPath, code };
  }

  return { exists: false };
}

function generateFieldDefinition(field: FieldAnalysis, provider: string): string {
  const commonInfo = COMMON_FIELD_INFO[field.name as keyof typeof COMMON_FIELD_INFO];

  let def = '    {\n';
  def += `      name: "${field.name}",\n`;
  def += `      label: "${commonInfo?.label || field.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}",\n`;
  def += `      type: "${field.inferredType}",\n`;
  def += `      required: ${field.required},\n`;

  if (field.shouldBeDynamic && field.dynamicType) {
    def += `      dynamic: "${provider}-${field.dynamicType.split('-')[1]}",\n`;
    def += `      loadOnMount: true,\n`;
  }

  if (commonInfo?.defaultValue !== undefined) {
    def += `      defaultValue: ${typeof commonInfo.defaultValue === 'string' ? `"${commonInfo.defaultValue}"` : commonInfo.defaultValue},\n`;
  }

  if (commonInfo?.tooltip || field.suggestions.length > 0) {
    const tooltip = commonInfo?.tooltip || field.suggestions[0];
    def += `      tooltip: "${tooltip}",\n`;
  }

  if (field.inferredType === 'array') {
    def += `      placeholder: JSON.stringify(["example1", "example2"], null, 2),\n`;
  }

  def += `    }`;

  return def;
}

async function analyzeAllNodes(targetProvider?: string): Promise<FixReport> {
  const report: FixReport = {
    totalNodes: 0,
    nodesWithIssues: 0,
    criticalFixes: 0,
    fieldsToAdd: 0,
    improvementsSuggested: 0,
    fixes: [],
    summary: {
      byProvider: {},
      byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
    },
  };

  console.log('🔍 Analyzing all nodes...\n');

  const nodesPath = path.join(process.cwd(), 'lib/workflows/nodes/providers');
  const providers = fs.readdirSync(nodesPath).filter(f =>
    fs.statSync(path.join(nodesPath, f)).isDirectory() &&
    (!targetProvider || f === targetProvider)
  );

  for (const provider of providers) {
    const indexPath = path.join(nodesPath, provider, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;

    const nodeContent = fs.readFileSync(indexPath, 'utf-8');
    const nodeTypeMatches = nodeContent.matchAll(/type:\s*["']([^"']+)["']/g);

    for (const match of nodeTypeMatches) {
      const nodeType = match[1];
      report.totalNodes++;

      // Skip trigger nodes for now (different pattern)
      if (nodeType.includes('_trigger_')) continue;

      const handler = await getHandlerPath(nodeType);
      if (!handler.exists) continue;

      const schemaFields = extractSchemaFields(nodeContent, nodeType);
      const handlerFields = extractHandlerFields(handler.code!);
      const nodeInfo = getNodeInfo(nodeContent, nodeType);

      const missingFields: FieldAnalysis[] = [];

      for (const handlerField of handlerFields) {
        if (!schemaFields.has(handlerField)) {
          const analysis = analyzeHandlerCode(handler.code!, handlerField);
          analysis.currentlyInSchema = false;
          missingFields.push(analysis);
        }
      }

      if (missingFields.length > 0) {
        const priority = missingFields.some(f => f.required) ? 'critical' :
                        missingFields.length > 5 ? 'high' :
                        missingFields.length > 2 ? 'medium' : 'low';

        report.fixes.push({
          provider,
          nodeType,
          nodeTitle: nodeInfo.title,
          filePath: indexPath,
          handlerPath: handler.path!,
          missingFields,
          improvements: [],
          priority,
        });

        report.nodesWithIssues++;
        report.fieldsToAdd += missingFields.length;
        if (priority === 'critical') report.criticalFixes++;

        // Update summary
        if (!report.summary.byProvider[provider]) {
          report.summary.byProvider[provider] = { critical: 0, high: 0, medium: 0, low: 0 };
        }
        report.summary.byProvider[provider][priority]++;
        report.summary.byPriority[priority]++;
      }
    }
  }

  return report;
}

function generateMarkdownReport(report: FixReport): string {
  let md = '# Smart Node Configuration Fix Report\n\n';
  md += `**Generated**: ${new Date().toISOString()}\n\n`;

  md += '## Summary\n\n';
  md += `- **Total Nodes Analyzed**: ${report.totalNodes}\n`;
  md += `- **Nodes with Issues**: ${report.nodesWithIssues}\n`;
  md += `- **Fields to Add**: ${report.fieldsToAdd}\n\n`;

  md += '### Priority Breakdown\n\n';
  md += `- 🔴 **Critical**: ${report.summary.byPriority.critical} (missing required fields)\n`;
  md += `- 🟠 **High**: ${report.summary.byPriority.high} (5+ missing fields)\n`;
  md += `- 🟡 **Medium**: ${report.summary.byPriority.medium} (3-5 missing fields)\n`;
  md += `- 🟢 **Low**: ${report.summary.byPriority.low} (1-2 missing fields)\n\n`;

  md += '## Fixes by Provider\n\n';
  for (const [provider, counts] of Object.entries(report.summary.byProvider)) {
    const total = counts.critical + counts.high + counts.medium + counts.low;
    md += `### ${provider} (${total} nodes)\n\n`;
    md += `- Critical: ${counts.critical} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low}\n\n`;
  }

  md += '## Detailed Fixes\n\n';

  for (const priority of ['critical', 'high', 'medium', 'low'] as const) {
    const fixes = report.fixes.filter(f => f.priority === priority);
    if (fixes.length === 0) continue;

    const emoji = priority === 'critical' ? '🔴' : priority === 'high' ? '🟠' : priority === 'medium' ? '🟡' : '🟢';
    md += `### ${emoji} ${priority.toUpperCase()} Priority\n\n`;

    for (const fix of fixes) {
      md += `#### ${fix.provider}: ${fix.nodeTitle}\n\n`;
      md += `**Node Type**: \`${fix.nodeType}\`\n\n`;
      md += `**Missing Fields** (${fix.missingFields.length}):\n\n`;

      for (const field of fix.missingFields) {
        md += `- **${field.name}** (${field.inferredType}${field.required ? ', required' : ''})\n`;
        if (field.shouldBeDynamic) {
          md += `  - 💡 Should be dynamic dropdown: \`${field.dynamicType}\`\n`;
        }
        for (const suggestion of field.suggestions) {
          md += `  - 💡 ${suggestion}\n`;
        }
      }
      md += '\n';
    }
  }

  return md;
}

async function applyFixes(report: FixReport, dryRun: boolean = false): Promise<void> {
  console.log(`\n${dryRun ? '🔍 DRY RUN - No files will be modified' : '✏️  Applying fixes...'}\n`);

  let filesModified = 0;
  let fieldsAdded = 0;

  for (const fix of report.fixes) {
    try {
      const content = fs.readFileSync(fix.filePath, 'utf-8');
      const nodeInfo = getNodeInfo(content, fix.nodeType);

      if (nodeInfo.startIndex === -1) {
        console.log(`⚠️  Could not find node ${fix.nodeType} in ${fix.filePath}`);
        continue;
      }

      // Find configSchema array end
      const configSchemaEnd = findConfigSchemaEnd(content, nodeInfo.startIndex);
      if (configSchemaEnd === -1) {
        console.log(`⚠️  Could not find configSchema end for ${fix.nodeType}`);
        continue;
      }

      // Generate new fields
      const newFields = fix.missingFields
        .map(field => generateFieldDefinition(field, fix.provider))
        .join(',\n');

      // Insert before the closing bracket
      const before = content.substring(0, configSchemaEnd);
      const after = content.substring(configSchemaEnd);

      // Add comma if there are existing fields
      const hasExistingFields = before.substring(before.lastIndexOf('configSchema:'), configSchemaEnd).includes('name:');
      const separator = hasExistingFields ? ',\n' : '\n';

      const newContent = before + separator + newFields + '\n  ' + after;

      if (!dryRun) {
        fs.writeFileSync(fix.filePath, newContent);
      }

      console.log(`✅ ${fix.provider}/${fix.nodeTitle}: Added ${fix.missingFields.length} fields`);
      filesModified++;
      fieldsAdded += fix.missingFields.length;

    } catch (error) {
      console.error(`❌ Error fixing ${fix.nodeType}:`, error);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files ${dryRun ? 'would be' : ''} modified: ${filesModified}`);
  console.log(`   Fields ${dryRun ? 'would be' : ''} added: ${fieldsAdded}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const providerArg = args.find(arg => arg.startsWith('--provider='));
  const targetProvider = providerArg?.split('=')[1];

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Smart Node Configuration Fixer                   ║');
  console.log('║  Analyzing handlers and generating fixes                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (targetProvider) {
    console.log(`🎯 Targeting provider: ${targetProvider}\n`);
  }

  // Analyze all nodes
  const report = await analyzeAllNodes(targetProvider);

  // Generate markdown report
  const markdown = generateMarkdownReport(report);
  const reportPath = path.join(process.cwd(), 'SMART_FIX_REPORT.md');
  fs.writeFileSync(reportPath, markdown);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    ANALYSIS COMPLETE                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Results:`);
  console.log(`   Nodes analyzed: ${report.totalNodes}`);
  console.log(`   Nodes with issues: ${report.nodesWithIssues}`);
  console.log(`   Fields to add: ${report.fieldsToAdd}\n`);

  console.log(`🎯 Priority:`);
  console.log(`   🔴 Critical: ${report.summary.byPriority.critical}`);
  console.log(`   🟠 High: ${report.summary.byPriority.high}`);
  console.log(`   🟡 Medium: ${report.summary.byPriority.medium}`);
  console.log(`   🟢 Low: ${report.summary.byPriority.low}\n`);

  console.log(`📄 Full report: ${reportPath}\n`);

  // Apply fixes if not dry run
  if (!dryRun && report.fixes.length > 0) {
    console.log('⚠️  About to modify files. Press Ctrl+C to cancel...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await applyFixes(report, false);
  } else if (dryRun) {
    await applyFixes(report, true);
  }

  console.log('\n✨ Done!\n');
}

main().catch(console.error);
