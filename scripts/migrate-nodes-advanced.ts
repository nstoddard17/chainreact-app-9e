/**
 * Advanced Node Migration Script
 * Uses TypeScript AST parsing for accurate extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Configuration
const SOURCE_FILE = path.join(__dirname, '../lib/workflows/availableNodes.ts');
const OUTPUT_DIR = path.join(__dirname, '../lib/workflows/nodes/providers');
const TYPES_IMPORT = '../../../types';

// Providers to skip (already migrated)
const SKIP_PROVIDERS = ['gmail', 'slack'];

interface NodeDefinition {
  type: string;
  title: string;
  description: string;
  icon: string;
  isTrigger: boolean;
  providerId: string;
  category?: string;
  requiredScopes?: string[];
  configSchema?: any[];
  outputSchema?: any[];
  raw: string;
}

// Read and parse the TypeScript file
function parseSourceFile(): ts.SourceFile {
  const content = fs.readFileSync(SOURCE_FILE, 'utf8');
  return ts.createSourceFile(
    SOURCE_FILE,
    content,
    ts.ScriptTarget.Latest,
    true
  );
}

// Extract string literal value
function getStringLiteral(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.getText();
  }
  return undefined;
}

// Extract boolean literal value
function getBooleanLiteral(node: ts.Node): boolean | undefined {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  return undefined;
}

// Extract property value from object literal
function getPropertyValue(obj: ts.ObjectLiteralExpression, propName: string): any {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = prop.name;
      if (ts.isIdentifier(name) && name.text === propName) {
        return prop.initializer;
      }
    }
  }
  return undefined;
}

// Extract node definitions from AST
function extractNodes(sourceFile: ts.SourceFile): NodeDefinition[] {
  const nodes: NodeDefinition[] = [];
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  // Find ALL_NODE_COMPONENTS array
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (ts.isVariableDeclaration(decl) &&
          decl.name.getText() === 'ALL_NODE_COMPONENTS' &&
          decl.initializer &&
          ts.isArrayLiteralExpression(decl.initializer)) {

        // Process each element in the array
        decl.initializer.elements.forEach(element => {
          if (ts.isObjectLiteralExpression(element)) {
            const nodeObj = extractNodeFromObject(element, sourceFile, printer);
            if (nodeObj && nodeObj.providerId && !SKIP_PROVIDERS.includes(nodeObj.providerId)) {
              nodes.push(nodeObj);
            }
          }
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return nodes;
}

// Extract node properties from object literal
function extractNodeFromObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  printer: ts.Printer
): NodeDefinition | null {
  const node: Partial<NodeDefinition> = {};

  // Extract raw text
  node.raw = printer.printNode(ts.EmitHint.Unspecified, obj, sourceFile);

  // Extract properties
  const typeNode = getPropertyValue(obj, 'type');
  const titleNode = getPropertyValue(obj, 'title');
  const descriptionNode = getPropertyValue(obj, 'description');
  const iconNode = getPropertyValue(obj, 'icon');
  const isTriggerNode = getPropertyValue(obj, 'isTrigger');
  const providerIdNode = getPropertyValue(obj, 'providerId');
  const categoryNode = getPropertyValue(obj, 'category');

  node.type = getStringLiteral(typeNode) || '';
  node.title = getStringLiteral(titleNode) || '';
  node.description = getStringLiteral(descriptionNode) || '';
  node.icon = getStringLiteral(iconNode) || 'FileText';
  node.isTrigger = getBooleanLiteral(isTriggerNode) || false;
  node.providerId = getStringLiteral(providerIdNode) || '';
  node.category = getStringLiteral(categoryNode);

  if (node.type && node.providerId) {
    return node as NodeDefinition;
  }

  return null;
}

// Convert node type to camelCase filename
function getFileName(nodeType: string, isTrigger: boolean): string {
  const parts = nodeType.split('_');
  const name = parts.slice(2).join('_');

  // Convert snake_case to camelCase
  const camelName = name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

  return camelName || 'default';
}

// Generate schema file content
function generateSchemaContent(node: NodeDefinition): string {
  const fileName = getFileName(node.type, node.isTrigger);
  const schemaName = `${fileName}${node.isTrigger ? 'Trigger' : 'Action'}Schema`;

  // Process the raw definition
  let processedDef = node.raw;

  // Add icon as string
  if (node.icon && !node.icon.includes('"') && !node.icon.includes("'")) {
    processedDef = processedDef.replace(
      new RegExp(`icon:\\s*${node.icon}`),
      `icon: "${node.icon}" as any`
    );
  }

  return `import { NodeComponent } from "${TYPES_IMPORT}"

export const ${schemaName}: NodeComponent = ${processedDef}`;
}

// Generate provider index file
function generateIndexContent(providerId: string, nodes: NodeDefinition[]): string {
  const actions = nodes.filter(n => !n.isTrigger);
  const triggers = nodes.filter(n => n.isTrigger);

  // Collect unique icons
  const uniqueIcons = [...new Set(nodes.map(n => n.icon))].filter(i => i && i !== 'FileText');

  // Generate content parts
  const parts: string[] = [];

  // Icon imports
  if (uniqueIcons.length > 0) {
    parts.push(`import { ${uniqueIcons.join(', ')} } from "lucide-react"`);
  }
  parts.push(`import { NodeComponent } from "../../types"`);
  parts.push('');

  // Action imports
  if (actions.length > 0) {
    parts.push('// Import action schemas');
    actions.forEach(a => {
      const fileName = getFileName(a.type, false);
      parts.push(`import { ${fileName}ActionSchema } from "./actions/${fileName}.schema"`);
    });
    parts.push('');
  }

  // Trigger imports
  if (triggers.length > 0) {
    parts.push('// Import trigger schemas');
    triggers.forEach(t => {
      const fileName = getFileName(t.type, true);
      parts.push(`import { ${fileName}TriggerSchema } from "./triggers/${fileName}.schema"`);
    });
    parts.push('');
  }

  // Apply icons to actions
  if (actions.length > 0) {
    parts.push('// Apply icons to actions');
    actions.forEach(a => {
      const fileName = getFileName(a.type, false);
      parts.push(`const ${fileName}: NodeComponent = {
  ...${fileName}ActionSchema,
  icon: ${a.icon}
}`);
      parts.push('');
    });
  }

  // Apply icons to triggers
  if (triggers.length > 0) {
    parts.push('// Apply icons to triggers');
    triggers.forEach(t => {
      const fileName = getFileName(t.type, true);
      parts.push(`const ${fileName}: NodeComponent = {
  ...${fileName}TriggerSchema,
  icon: ${t.icon}
}`);
      parts.push('');
    });
  }

  // Export array
  const allExports = [
    ...actions.map(a => getFileName(a.type, false)),
    ...triggers.map(t => getFileName(t.type, true))
  ];

  parts.push(`// Export all ${providerId} nodes`);
  parts.push(`export const ${providerId.replace(/-/g, '_')}Nodes: NodeComponent[] = [`);
  allExports.forEach(exp => {
    parts.push(`  ${exp},`);
  });
  parts.push(']');
  parts.push('');

  // Export individuals
  parts.push('// Export individual nodes for direct access');
  parts.push('export {');
  allExports.forEach(exp => {
    parts.push(`  ${exp},`);
  });
  parts.push('}');

  return parts.join('\n');
}

// Create directory structure
function createProviderStructure(providerId: string) {
  const providerDir = path.join(OUTPUT_DIR, providerId);
  const actionsDir = path.join(providerDir, 'actions');
  const triggersDir = path.join(providerDir, 'triggers');

  if (!fs.existsSync(providerDir)) {
    fs.mkdirSync(providerDir, { recursive: true });
  }
  if (!fs.existsSync(actionsDir)) {
    fs.mkdirSync(actionsDir);
  }
  if (!fs.existsSync(triggersDir)) {
    fs.mkdirSync(triggersDir);
  }

  return { providerDir, actionsDir, triggersDir };
}

// Write files for a provider
function writeProviderFiles(providerId: string, nodes: NodeDefinition[]) {
  const { providerDir, actionsDir, triggersDir } = createProviderStructure(providerId);

  // Write individual schema files
  nodes.forEach(node => {
    const fileName = getFileName(node.type, node.isTrigger);
    const dir = node.isTrigger ? triggersDir : actionsDir;
    const filePath = path.join(dir, `${fileName}.schema.ts`);
    const content = generateSchemaContent(node);

    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Created ${node.isTrigger ? 'trigger' : 'action'}: ${fileName}.schema.ts`);
  });

  // Write index file
  const indexPath = path.join(providerDir, 'index.ts');
  const indexContent = generateIndexContent(providerId, nodes);
  fs.writeFileSync(indexPath, indexContent);
  console.log(`  ✓ Created index.ts for ${providerId}`);
}

// Main migration function
function migrateNodes() {
  console.log('🚀 Starting advanced node migration...\n');

  const sourceFile = parseSourceFile();
  const allNodes = extractNodes(sourceFile);

  // Group nodes by provider
  const nodesByProvider = new Map<string, NodeDefinition[]>();
  allNodes.forEach(node => {
    if (!nodesByProvider.has(node.providerId)) {
      nodesByProvider.set(node.providerId, []);
    }
    nodesByProvider.get(node.providerId)!.push(node);
  });

  console.log(`Found ${nodesByProvider.size} providers with ${allNodes.length} total nodes\n`);

  let totalMigrated = 0;

  nodesByProvider.forEach((nodes, providerId) => {
    console.log(`\n📦 Processing ${providerId}...`);
    console.log(`  Found ${nodes.length} nodes (${nodes.filter(n => !n.isTrigger).length} actions, ${nodes.filter(n => n.isTrigger).length} triggers)`);

    try {
      writeProviderFiles(providerId, nodes);
      totalMigrated += nodes.length;
    } catch (error) {
      console.error(`  ❌ Error processing ${providerId}:`, error);
    }
  });

  console.log(`\n✅ Migration complete! Migrated ${totalMigrated} nodes from ${nodesByProvider.size} providers.`);
  console.log('\nNext steps:');
  console.log('1. Review the generated files for accuracy');
  console.log('2. Fix any compilation errors');
  console.log('3. Update the main nodes/index.ts to import all providers');
  console.log('4. Test with: npx tsc --noEmit --skipLibCheck');
}

// Run the migration
try {
  migrateNodes();
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}