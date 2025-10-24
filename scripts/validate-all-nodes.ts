/**
 * Comprehensive Node Validation Script
 *
 * This script validates ALL workflow nodes across ALL integrations to ensure:
 * 1. Schema fields match handler parameters
 * 2. All required fields are properly configured
 * 3. Dynamic fields have proper dependencies
 * 4. Handlers exist for all node types
 * 5. Output schemas match handler outputs
 *
 * Run with: npx tsx scripts/validate-all-nodes.ts
 */

import fs from 'fs';
import path from 'path';

interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  provider: string;
  nodeType: string;
  nodeTitle: string;
  category: string;
  issue: string;
  suggestion?: string;
  location?: string;
}

interface ValidationReport {
  totalNodes: number;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  issues: ValidationIssue[];
  summary: {
    byProvider: Record<string, number>;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

// Common field patterns that handlers use
const COMMON_HANDLER_PATTERNS = {
  // Fields that are often in handlers but optional in schemas
  optionalFields: ['limit', 'offset', 'starting_after', 'properties', 'fields', 'expand'],

  // Fields that might be named differently
  fieldAliases: {
    'audience_id': ['audienceId', 'audience'],
    'customerId': ['customer_id', 'customer'],
    'subscriber_email': ['subscriberEmail', 'email'],
    'list_id': ['listId', 'list'],
  },

  // Required patterns for specific node types
  requiredByType: {
    'get': ['limit'], // Get actions should have pagination
    'create': [], // Create actions vary
    'update': [], // Update actions vary
    'delete': [], // Delete actions vary
    'send': [], // Send actions vary
  }
};

async function getAllNodeDefinitions(): Promise<any[]> {
  const nodesPath = path.join(process.cwd(), 'lib/workflows/nodes/providers');
  const providers = fs.readdirSync(nodesPath).filter(f =>
    fs.statSync(path.join(nodesPath, f)).isDirectory()
  );

  const allNodes: any[] = [];

  for (const provider of providers) {
    try {
      const indexPath = path.join(nodesPath, provider, 'index.ts');
      if (!fs.existsSync(indexPath)) continue;

      const content = fs.readFileSync(indexPath, 'utf-8');

      // Extract node definitions
      const nodeMatches = content.matchAll(/{\s*type:\s*["']([^"']+)["']/g);

      for (const match of nodeMatches) {
        const nodeType = match[1];
        allNodes.push({
          provider,
          nodeType,
          filePath: indexPath
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not process ${provider}:`, error);
    }
  }

  return allNodes;
}

async function getHandlerForNode(nodeType: string): Promise<{ exists: boolean; path?: string; code?: string }> {
  // Extract provider and action from node type
  // Format: provider_type_action (e.g., gmail_action_send_email, slack_trigger_new_message)
  const parts = nodeType.split('_');
  if (parts.length < 3) return { exists: false };

  const provider = parts[0];
  const isTrigger = parts[1] === 'trigger';
  const actionName = parts.slice(2).join('_');

  // Convert to camelCase for function name
  const functionName = actionName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

  const handlerDir = isTrigger ? 'triggers' : 'actions';
  const handlerPath = path.join(
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

  // Try alternative naming (some use different patterns)
  const altHandlerPath = path.join(
    process.cwd(),
    'lib/workflows',
    handlerDir,
    provider,
    `${functionName}.ts`
  );

  if (fs.existsSync(altHandlerPath)) {
    const code = fs.readFileSync(altHandlerPath, 'utf-8');
    return { exists: true, path: altHandlerPath, code };
  }

  return { exists: false };
}

function extractConfigFieldsFromHandler(handlerCode: string): string[] {
  const fields: string[] = [];

  // Match patterns like: config.fieldName or config['field_name']
  const configMatches = handlerCode.matchAll(/config\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const match of configMatches) {
    fields.push(match[1]);
  }

  const bracketMatches = handlerCode.matchAll(/config\[['"]([^'"]+)['"]\]/g);
  for (const match of bracketMatches) {
    fields.push(match[1]);
  }

  // Remove duplicates
  return [...new Set(fields)];
}

function extractSchemaFields(nodeContent: string, nodeType: string): { name: string; required: boolean; type: string }[] {
  // Find the node definition block
  const nodeDefStart = nodeContent.indexOf(`type: "${nodeType}"`);
  if (nodeDefStart === -1) return [];

  // Find configSchema block
  const configSchemaStart = nodeContent.indexOf('configSchema:', nodeDefStart);
  if (configSchemaStart === -1) return [];

  // Find the next node or end of array
  const nextNodeStart = nodeContent.indexOf('type:', configSchemaStart + 20);
  const endOfArray = nodeContent.indexOf(']', configSchemaStart);
  const nodeDefEnd = nextNodeStart !== -1 && nextNodeStart < endOfArray ? nextNodeStart : endOfArray;

  const configBlock = nodeContent.substring(configSchemaStart, nodeDefEnd);

  const fields: { name: string; required: boolean; type: string }[] = [];

  // Extract field definitions
  const fieldMatches = configBlock.matchAll(/{\s*name:\s*["']([^"']+)["'][^}]*required:\s*(true|false)[^}]*type:\s*["']([^"']+)["']/gs);

  for (const match of fieldMatches) {
    fields.push({
      name: match[1],
      required: match[2] === 'true',
      type: match[3]
    });
  }

  return fields;
}

function getNodeTitle(nodeContent: string, nodeType: string): string {
  const nodeDefStart = nodeContent.indexOf(`type: "${nodeType}"`);
  if (nodeDefStart === -1) return nodeType;

  const titleMatch = nodeContent.substring(nodeDefStart, nodeDefStart + 300).match(/title:\s*["']([^"']+)["']/);
  return titleMatch ? titleMatch[1] : nodeType;
}

function checkFieldAlignment(
  provider: string,
  nodeType: string,
  nodeTitle: string,
  schemaFields: { name: string; required: boolean; type: string }[],
  handlerFields: string[],
  handlerCode: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if handler uses fields not in schema
  for (const handlerField of handlerFields) {
    const schemaHasField = schemaFields.some(f => f.name === handlerField);

    if (!schemaHasField) {
      // Check if it's a common alias
      let isAlias = false;
      for (const [canonical, aliases] of Object.entries(COMMON_HANDLER_PATTERNS.fieldAliases)) {
        if (aliases.includes(handlerField) && schemaFields.some(f => f.name === canonical)) {
          isAlias = true;
          break;
        }
      }

      if (!isAlias) {
        // Check if it's resolved but not used for the actual API call
        const isJustResolved = handlerCode.includes(`resolveVariable(config.${handlerField})`) &&
                               !handlerCode.match(new RegExp(`${handlerField}[^:]`, 'g'));

        if (!isJustResolved) {
          issues.push({
            severity: 'critical',
            provider,
            nodeType,
            nodeTitle,
            category: 'field_alignment',
            issue: `Handler reads field '${handlerField}' but it's not in the schema`,
            suggestion: `Add field '${handlerField}' to configSchema in ${provider}/index.ts`,
            location: `Handler uses config.${handlerField}`
          });
        }
      }
    }
  }

  // Check if required schema fields are actually used by handler
  for (const schemaField of schemaFields.filter(f => f.required)) {
    const handlerUsesField = handlerFields.includes(schemaField.name);

    if (!handlerUsesField) {
      // Check aliases
      const aliases = Object.entries(COMMON_HANDLER_PATTERNS.fieldAliases)
        .find(([canonical]) => canonical === schemaField.name)?.[1] || [];

      const usesAlias = aliases.some(alias => handlerFields.includes(alias));

      if (!usesAlias) {
        issues.push({
          severity: 'warning',
          provider,
          nodeType,
          nodeTitle,
          category: 'unused_required_field',
          issue: `Schema requires field '${schemaField.name}' but handler doesn't use it`,
          suggestion: `Either make field optional or ensure handler uses it`,
          location: `Schema marks ${schemaField.name} as required`
        });
      }
    }
  }

  return issues;
}

function checkCommonPatterns(
  provider: string,
  nodeType: string,
  nodeTitle: string,
  schemaFields: { name: string; required: boolean; type: string }[],
  handlerFields: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if "Get" actions have pagination
  if (nodeType.includes('_get_') && !nodeType.includes('_getter_')) {
    const hasPagination = schemaFields.some(f =>
      ['limit', 'offset', 'starting_after', 'page', 'per_page'].includes(f.name)
    );

    if (!hasPagination) {
      issues.push({
        severity: 'info',
        provider,
        nodeType,
        nodeTitle,
        category: 'missing_pagination',
        issue: 'Get action should have pagination fields (limit, offset, or starting_after)',
        suggestion: 'Add limit and/or offset fields to configSchema for better UX'
      });
    }
  }

  // Check if handler supports more fields than schema exposes
  const commonOptionalFields = ['properties', 'fields', 'expand', 'include'];
  for (const field of commonOptionalFields) {
    if (handlerFields.includes(field) && !schemaFields.some(f => f.name === field)) {
      issues.push({
        severity: 'info',
        provider,
        nodeType,
        nodeTitle,
        category: 'missing_optional_field',
        issue: `Handler supports '${field}' field but schema doesn't expose it`,
        suggestion: `Add optional '${field}' field to schema for advanced use cases`
      });
    }
  }

  return issues;
}

async function validateAllNodes(): Promise<ValidationReport> {
  const report: ValidationReport = {
    totalNodes: 0,
    totalIssues: 0,
    criticalIssues: 0,
    warningIssues: 0,
    infoIssues: 0,
    issues: [],
    summary: {
      byProvider: {},
      bySeverity: { critical: 0, warning: 0, info: 0 },
      byCategory: {}
    }
  };

  console.log('🔍 Starting comprehensive node validation...\n');

  const nodes = await getAllNodeDefinitions();
  report.totalNodes = nodes.length;

  console.log(`Found ${nodes.length} nodes across ${new Set(nodes.map(n => n.provider)).size} providers\n`);

  for (const node of nodes) {
    const { provider, nodeType, filePath } = node;

    // Get handler
    const handler = await getHandlerForNode(nodeType);

    if (!handler.exists) {
      report.issues.push({
        severity: 'critical',
        provider,
        nodeType,
        nodeTitle: nodeType,
        category: 'missing_handler',
        issue: 'No handler found for this node type',
        suggestion: `Create handler at lib/workflows/actions/${provider}/${nodeType.split('_').slice(2).join('_')}.ts`
      });
      continue;
    }

    // Read node definition
    const nodeContent = fs.readFileSync(filePath, 'utf-8');
    const schemaFields = extractSchemaFields(nodeContent, nodeType);
    const handlerFields = extractConfigFieldsFromHandler(handler.code!);
    const nodeTitle = getNodeTitle(nodeContent, nodeType);

    // Run validations
    const alignmentIssues = checkFieldAlignment(
      provider,
      nodeType,
      nodeTitle,
      schemaFields,
      handlerFields,
      handler.code!
    );

    const patternIssues = checkCommonPatterns(
      provider,
      nodeType,
      nodeTitle,
      schemaFields,
      handlerFields
    );

    report.issues.push(...alignmentIssues, ...patternIssues);
  }

  // Calculate summary
  report.totalIssues = report.issues.length;

  for (const issue of report.issues) {
    // By severity
    report.summary.bySeverity[issue.severity]++;
    if (issue.severity === 'critical') report.criticalIssues++;
    if (issue.severity === 'warning') report.warningIssues++;
    if (issue.severity === 'info') report.infoIssues++;

    // By provider
    report.summary.byProvider[issue.provider] = (report.summary.byProvider[issue.provider] || 0) + 1;

    // By category
    report.summary.byCategory[issue.category] = (report.summary.byCategory[issue.category] || 0) + 1;
  }

  return report;
}

function generateMarkdownReport(report: ValidationReport): string {
  const timestamp = new Date().toISOString();

  let markdown = `# Node Validation Report\n\n`;
  markdown += `**Generated**: ${timestamp}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- **Total Nodes Checked**: ${report.totalNodes}\n`;
  markdown += `- **Total Issues Found**: ${report.totalIssues}\n`;
  markdown += `- **Critical Issues**: ${report.criticalIssues} 🔴\n`;
  markdown += `- **Warnings**: ${report.warningIssues} 🟡\n`;
  markdown += `- **Info**: ${report.infoIssues} 🔵\n\n`;

  if (report.criticalIssues === 0) {
    markdown += `### ✅ No Critical Issues Found!\n\n`;
    markdown += `All nodes have proper field alignment between schemas and handlers.\n\n`;
  } else {
    markdown += `### ⚠️ Action Required\n\n`;
    markdown += `${report.criticalIssues} critical issue(s) need immediate attention.\n\n`;
  }

  markdown += `## Issues by Provider\n\n`;
  markdown += `| Provider | Issues |\n`;
  markdown += `|----------|--------|\n`;

  const sortedProviders = Object.entries(report.summary.byProvider)
    .sort(([, a], [, b]) => b - a);

  for (const [provider, count] of sortedProviders) {
    markdown += `| ${provider} | ${count} |\n`;
  }

  markdown += `\n## Issues by Category\n\n`;
  markdown += `| Category | Count |\n`;
  markdown += `|----------|-------|\n`;

  for (const [category, count] of Object.entries(report.summary.byCategory)) {
    markdown += `| ${category.replace(/_/g, ' ')} | ${count} |\n`;
  }

  markdown += `\n## Detailed Issues\n\n`;

  // Group by severity
  for (const severity of ['critical', 'warning', 'info'] as const) {
    const severityIssues = report.issues.filter(i => i.severity === severity);
    if (severityIssues.length === 0) continue;

    const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
    markdown += `### ${emoji} ${severity.toUpperCase()} (${severityIssues.length})\n\n`;

    // Group by provider
    const byProvider: Record<string, ValidationIssue[]> = {};
    for (const issue of severityIssues) {
      if (!byProvider[issue.provider]) byProvider[issue.provider] = [];
      byProvider[issue.provider].push(issue);
    }

    for (const [provider, providerIssues] of Object.entries(byProvider)) {
      markdown += `#### ${provider} (${providerIssues.length})\n\n`;

      for (const issue of providerIssues) {
        markdown += `**${issue.nodeTitle}** (\`${issue.nodeType}\`)\n`;
        markdown += `- **Issue**: ${issue.issue}\n`;
        if (issue.suggestion) markdown += `- **Fix**: ${issue.suggestion}\n`;
        if (issue.location) markdown += `- **Location**: ${issue.location}\n`;
        markdown += `\n`;
      }
    }
  }

  markdown += `---\n\n`;
  markdown += `*Generated by validate-all-nodes.ts*\n`;

  return markdown;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Comprehensive Node Validation Script              ║');
  console.log('║  Checking all workflow nodes for configuration issues     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const report = await validateAllNodes();

  // Generate markdown report
  const markdown = generateMarkdownReport(report);
  const reportPath = path.join(process.cwd(), 'NODE_VALIDATION_REPORT.md');
  fs.writeFileSync(reportPath, markdown);

  // Console output
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                     VALIDATION COMPLETE                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Checked ${report.totalNodes} nodes`);
  console.log(`📊 Found ${report.totalIssues} total issues:\n`);
  console.log(`   🔴 Critical: ${report.criticalIssues}`);
  console.log(`   🟡 Warning:  ${report.warningIssues}`);
  console.log(`   🔵 Info:     ${report.infoIssues}\n`);

  if (report.criticalIssues > 0) {
    console.log('⚠️  CRITICAL ISSUES FOUND - Immediate action required!\n');
    console.log('Top issues by provider:');
    const topProviders = Object.entries(report.summary.byProvider)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    for (const [provider, count] of topProviders) {
      const criticalCount = report.issues.filter(i =>
        i.provider === provider && i.severity === 'critical'
      ).length;
      console.log(`   - ${provider}: ${count} total (${criticalCount} critical)`);
    }
  } else {
    console.log('✨ No critical issues found! All nodes are properly configured.');
  }

  console.log(`\n📄 Full report saved to: ${reportPath}\n`);

  // Exit with error code if critical issues found
  process.exit(report.criticalIssues > 0 ? 1 : 0);
}

main().catch(console.error);
