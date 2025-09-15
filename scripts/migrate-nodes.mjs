/**
 * Automated Node Migration Script
 * Extracts node definitions from availableNodes.ts and creates modular schema files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SOURCE_FILE = path.join(__dirname, '../lib/workflows/availableNodes.ts');
const OUTPUT_DIR = path.join(__dirname, '../lib/workflows/nodes/providers');
const TYPES_IMPORT = '../../../types';

// Providers to skip (already migrated)
const SKIP_PROVIDERS = ['gmail', 'slack']; // Add completed providers here

// Icon mappings for common icons
const ICON_MAP = {
  'Mail': 'Mail',
  'MessageSquare': 'MessageSquare',
  'MessageCircle': 'MessageCircle',
  'Hash': 'Hash',
  'Heart': 'Heart',
  'HeartOff': 'HeartOff',
  'UserPlus': 'UserPlus',
  'UserMinus': 'UserMinus',
  'Calendar': 'Calendar',
  'FileText': 'FileText',
  'Database': 'Database',
  'Search': 'Search',
  'Upload': 'Upload',
  'Download': 'Download',
  'Folder': 'Folder',
  'FolderPlus': 'FolderPlus',
  'File': 'File',
  'FileSpreadsheet': 'FileSpreadsheet',
  'Plus': 'Plus',
  'Edit': 'Edit',
  'PenSquare': 'PenSquare',
  'Trash2': 'Trash2',
  'Users': 'Users',
  'User': 'User',
  'Clock': 'Clock',
  'Globe': 'Globe',
  'Shield': 'Shield',
  'AlertCircle': 'AlertCircle',
  'AlertTriangle': 'AlertTriangle',
  'CheckCircle': 'CheckCircle',
  'Check': 'Check',
  'X': 'X',
  'XCircle': 'XCircle',
  'Info': 'Info',
  'Video': 'Video',
  'Camera': 'Camera',
  'Image': 'Image',
  'DollarSign': 'DollarSign',
  'CreditCard': 'CreditCard',
  'ShoppingCart': 'ShoppingCart',
  'Package': 'Package',
  'Send': 'Send',
  'GitBranch': 'GitBranch',
  'GitPullRequest': 'GitPullRequest',
  'Share': 'Share',
  'Share2': 'Share2',
  'Link': 'Link',
  'Code': 'Code',
  'Terminal': 'Terminal',
  'Cloud': 'Cloud',
  'CloudUpload': 'CloudUpload',
  'CloudDownload': 'CloudDownload',
  'Twitter': 'Twitter',
  'Facebook': 'Facebook',
  'Instagram': 'Instagram',
  'Linkedin': 'Linkedin',
  'Youtube': 'Youtube',
  'Repeat': 'Repeat',
  'RotateCcw': 'RotateCcw',
  'Building': 'Building',
  'Briefcase': 'Briefcase',
  'BarChart': 'BarChart',
  'BarChart2': 'BarChart2',
  'TrendingUp': 'TrendingUp',
  'Activity': 'Activity',
  'Zap': 'Zap',
  'Bot': 'Bot',
  'Cpu': 'Cpu',
  'HardDrive': 'HardDrive',
  'Server': 'Server',
  'Webhook': 'Webhook',
  'Key': 'Key',
  'Lock': 'Lock',
  'Unlock': 'Unlock',
  'Eye': 'Eye',
  'EyeOff': 'EyeOff',
  'Bell': 'Bell',
  'BellOff': 'BellOff',
  'Volume': 'Volume',
  'VolumeX': 'VolumeX',
  'Mic': 'Mic',
  'MicOff': 'MicOff',
  'Headphones': 'Headphones',
  'Music': 'Music',
  'Radio': 'Radio',
  'Tv': 'Tv',
  'Monitor': 'Monitor',
  'Smartphone': 'Smartphone',
  'Tablet': 'Tablet',
  'Watch': 'Watch',
  'List': 'List',
  'Move': 'Move',
  'Reply': 'Reply',
  'Forward': 'Forward',
  'AtSign': 'AtSign',
  'Layout': 'Layout',
  'MailOpen': 'MailOpen',
  'type': 'FileText' // Default fallback
};

// Read the source file
function readSourceFile() {
  return fs.readFileSync(SOURCE_FILE, 'utf8');
}

// Extract all nodes from the ALL_NODE_COMPONENTS array
function extractAllNodes(content) {
  const nodes = [];

  // Find the ALL_NODE_COMPONENTS array
  const arrayMatch = content.match(/export const ALL_NODE_COMPONENTS[^=]*=\s*\[([\s\S]*?)\n\]/);

  if (!arrayMatch) {
    console.error('Could not find ALL_NODE_COMPONENTS array');
    return nodes;
  }

  const arrayContent = arrayMatch[1];

  // Split by top-level commas (this is a simplified approach)
  // We'll look for objects that start with { and end with }
  let depth = 0;
  let currentNode = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < arrayContent.length; i++) {
    const char = arrayContent[i];
    const prevChar = i > 0 ? arrayContent[i - 1] : '';

    // Handle string boundaries
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') {
        depth++;
        if (depth === 1) {
          currentNode = '{';
        } else {
          currentNode += char;
        }
      } else if (char === '}') {
        currentNode += char;
        depth--;
        if (depth === 0 && currentNode.trim()) {
          // We have a complete node object
          nodes.push(currentNode);
          currentNode = '';
        }
      } else if (depth > 0) {
        currentNode += char;
      }
    } else if (depth > 0) {
      currentNode += char;
    }
  }

  return nodes;
}

// Parse a node object string to extract properties
function parseNode(nodeStr) {
  const node = {};

  // Extract type
  const typeMatch = nodeStr.match(/type:\s*(?:["']([^"']+)["']|([A-Z_]+\.[a-z]+))/);
  if (typeMatch) {
    node.type = typeMatch[1] || typeMatch[2];
  }

  // Extract title
  const titleMatch = nodeStr.match(/title:\s*(?:["']([^"']+)["']|([A-Z_]+\.[a-z]+))/);
  if (titleMatch) {
    node.title = titleMatch[1] || titleMatch[2];
  }

  // Extract description
  const descriptionMatch = nodeStr.match(/description:\s*(?:["']([^"']+)["']|([A-Z_]+\.[a-z]+))/);
  if (descriptionMatch) {
    node.description = descriptionMatch[1] || descriptionMatch[2];
  }

  // Extract icon
  const iconMatch = nodeStr.match(/icon:\s*([A-Za-z]+)/);
  if (iconMatch) {
    node.icon = iconMatch[1];
  }

  // Extract providerId
  const providerMatch = nodeStr.match(/providerId:\s*["']([^"']+)["']/);
  if (providerMatch) {
    node.providerId = providerMatch[1];
  }

  // Extract isTrigger
  const triggerMatch = nodeStr.match(/isTrigger:\s*(true|false)/);
  if (triggerMatch) {
    node.isTrigger = triggerMatch[1] === 'true';
  }

  // Store the full definition
  node.fullDefinition = nodeStr;

  return node;
}

// Group nodes by provider
function groupNodesByProvider(nodes) {
  const grouped = {};

  nodes.forEach(nodeStr => {
    const node = parseNode(nodeStr);

    if (node.providerId && !SKIP_PROVIDERS.includes(node.providerId)) {
      if (!grouped[node.providerId]) {
        grouped[node.providerId] = [];
      }
      grouped[node.providerId].push(node);
    }
  });

  return grouped;
}

// Convert node type to camelCase filename
function getFileName(nodeType, isTrigger) {
  if (!nodeType) return 'unknown';

  // Handle special cases
  if (nodeType.includes('.')) {
    // It's a reference like GMAIL_SEND_EMAIL_METADATA.key
    const parts = nodeType.split('.');
    return parts[0].toLowerCase().replace(/_/g, '');
  }

  // Remove provider prefix and convert to camelCase
  const parts = nodeType.split('_');
  const name = parts.slice(2).join('_'); // Skip provider and action/trigger

  // Convert snake_case to camelCase
  const camelName = name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

  return camelName || 'default';
}

// Generate schema file content
function generateSchemaContent(node, providerId) {
  const fileName = getFileName(node.type, node.isTrigger);
  const schemaName = `${fileName}${node.isTrigger ? 'Trigger' : 'Action'}Schema`;

  // Clean up the full definition
  let cleanDefinition = node.fullDefinition
    .replace(/^\s*\{/, '')  // Remove opening brace
    .replace(/\}\s*$/, '')  // Remove closing brace
    .trim();

  // Replace icon with quoted version if needed
  if (node.icon && !cleanDefinition.includes(`icon: "${node.icon}"`)) {
    cleanDefinition = cleanDefinition.replace(
      new RegExp(`icon:\\s*${node.icon}(?=,|\\s|$)`),
      `icon: "${node.icon}" as any`
    );
  }

  return `import { NodeComponent } from "${TYPES_IMPORT}"

export const ${schemaName}: NodeComponent = {
  ${cleanDefinition}
}`;
}

// Generate provider index file
function generateIndexContent(providerId, nodes) {
  const actions = nodes.filter(n => !n.isTrigger);
  const triggers = nodes.filter(n => n.isTrigger);

  // Collect unique icons
  const uniqueIcons = [...new Set(nodes.map(n => ICON_MAP[n.icon] || 'FileText'))];

  const lines = [];

  // Icon imports
  lines.push(`import { ${uniqueIcons.join(', ')} } from "lucide-react"`);
  lines.push(`import { NodeComponent } from "../../types"`);
  lines.push('');

  // Action imports
  if (actions.length > 0) {
    lines.push('// Import action schemas');
    actions.forEach(a => {
      const fileName = getFileName(a.type, false);
      lines.push(`import { ${fileName}ActionSchema } from "./actions/${fileName}.schema"`);
    });
    lines.push('');
  }

  // Trigger imports
  if (triggers.length > 0) {
    lines.push('// Import trigger schemas');
    triggers.forEach(t => {
      const fileName = getFileName(t.type, true);
      lines.push(`import { ${fileName}TriggerSchema } from "./triggers/${fileName}.schema"`);
    });
    lines.push('');
  }

  // Apply icons to actions
  if (actions.length > 0) {
    lines.push('// Apply icons to actions');
    actions.forEach(a => {
      const fileName = getFileName(a.type, false);
      const iconName = ICON_MAP[a.icon] || 'FileText';
      lines.push(`const ${fileName}: NodeComponent = {
  ...${fileName}ActionSchema,
  icon: ${iconName}
}`);
      lines.push('');
    });
  }

  // Apply icons to triggers
  if (triggers.length > 0) {
    lines.push('// Apply icons to triggers');
    triggers.forEach(t => {
      const fileName = getFileName(t.type, true);
      const iconName = ICON_MAP[t.icon] || 'FileText';
      lines.push(`const ${fileName}: NodeComponent = {
  ...${fileName}TriggerSchema,
  icon: ${iconName}
}`);
      lines.push('');
    });
  }

  // Export array
  const allExports = [
    ...actions.map(a => getFileName(a.type, false)),
    ...triggers.map(t => getFileName(t.type, true))
  ];

  const providerVarName = providerId.replace(/-/g, '_');
  lines.push(`// Export all ${providerId} nodes`);
  lines.push(`export const ${providerVarName}Nodes: NodeComponent[] = [`);
  allExports.forEach(exp => {
    lines.push(`  ${exp},`);
  });
  lines.push(']');
  lines.push('');

  // Export individuals
  lines.push('// Export individual nodes for direct access');
  lines.push('export {');
  allExports.forEach(exp => {
    lines.push(`  ${exp},`);
  });
  lines.push('}');

  return lines.join('\n');
}

// Create directory structure for a provider
function createProviderStructure(providerId) {
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

// Write schema files for a provider
function writeProviderFiles(providerId, nodes) {
  const { providerDir, actionsDir, triggersDir } = createProviderStructure(providerId);

  // Write individual schema files
  nodes.forEach(node => {
    try {
      const fileName = getFileName(node.type, node.isTrigger);
      const dir = node.isTrigger ? triggersDir : actionsDir;
      const filePath = path.join(dir, `${fileName}.schema.ts`);
      const content = generateSchemaContent(node, providerId);

      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Created ${node.isTrigger ? 'trigger' : 'action'}: ${fileName}.schema.ts`);
    } catch (e) {
      console.error(`  ❌ Error creating schema for ${node.type}:`, e.message);
    }
  });

  // Write index file
  try {
    const indexPath = path.join(providerDir, 'index.ts');
    const indexContent = generateIndexContent(providerId, nodes);
    fs.writeFileSync(indexPath, indexContent);
    console.log(`  ✓ Created index.ts for ${providerId}`);
  } catch (e) {
    console.error(`  ❌ Error creating index for ${providerId}:`, e.message);
  }
}

// Main migration function
function migrateNodes() {
  console.log('🚀 Starting automated node migration...\n');

  const content = readSourceFile();
  const allNodeStrings = extractAllNodes(content);

  console.log(`Found ${allNodeStrings.length} total nodes in ALL_NODE_COMPONENTS\n`);

  const nodesByProvider = groupNodesByProvider(allNodeStrings);
  const providers = Object.keys(nodesByProvider);

  console.log(`Found ${providers.length} providers to migrate:`);
  console.log(providers.join(', '));
  console.log('');

  let totalNodes = 0;

  providers.forEach(providerId => {
    const nodes = nodesByProvider[providerId];
    console.log(`\n📦 Processing ${providerId}...`);
    console.log(`  Found ${nodes.length} nodes (${nodes.filter(n => !n.isTrigger).length} actions, ${nodes.filter(n => n.isTrigger).length} triggers)`);

    try {
      writeProviderFiles(providerId, nodes);
      totalNodes += nodes.length;
    } catch (error) {
      console.error(`  ❌ Failed to process ${providerId}:`, error.message);
    }
  });

  console.log(`\n✅ Migration complete! Processed ${totalNodes} nodes from ${providers.length} providers.`);
  console.log('\nNext steps:');
  console.log('1. Review the generated files for accuracy');
  console.log('2. Fix any parsing issues or missing fields');
  console.log('3. Update the main nodes/index.ts to import all providers');
  console.log('4. Test the compilation with: npx tsc --noEmit --skipLibCheck');
}

// Run the migration
try {
  migrateNodes();
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}