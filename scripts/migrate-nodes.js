/**
 * Automated Node Migration Script
 * Extracts node definitions from availableNodes.ts and creates modular schema files
 */

const fs = require('fs');
const path = require('path');

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
  'File': 'File',
  'Plus': 'Plus',
  'Edit': 'Edit',
  'Trash2': 'Trash2',
  'Users': 'Users',
  'User': 'User',
  'Clock': 'Clock',
  'Globe': 'Globe',
  'Shield': 'Shield',
  'AlertCircle': 'AlertCircle',
  'CheckCircle': 'CheckCircle',
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
  'type': 'FileText' // Default fallback
};

// Read the source file
function readSourceFile() {
  return fs.readFileSync(SOURCE_FILE, 'utf8');
}

// Extract node definitions for a specific provider
function extractProviderNodes(content, providerId) {
  const nodes = [];

  // Regular expression to match node objects with the specified providerId
  // This is a simplified pattern - may need adjustment for complex cases
  const nodePattern = new RegExp(
    `\\{[^{}]*providerId:\\s*["']${providerId}["'][^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}`,
    'gs'
  );

  const matches = content.match(nodePattern);

  if (matches) {
    matches.forEach(match => {
      try {
        // Extract key properties using regex
        const typeMatch = match.match(/type:\s*["']([^"']+)["']/);
        const titleMatch = match.match(/title:\s*["']([^"']+)["']/);
        const descriptionMatch = match.match(/description:\s*["']([^"']+)["']/);
        const iconMatch = match.match(/icon:\s*([A-Za-z]+)/);
        const isTriggerMatch = match.match(/isTrigger:\s*(true|false)/);

        if (typeMatch && titleMatch) {
          nodes.push({
            type: typeMatch[1],
            title: titleMatch[1],
            description: descriptionMatch ? descriptionMatch[1] : '',
            icon: iconMatch ? iconMatch[1] : 'FileText',
            isTrigger: isTriggerMatch ? isTriggerMatch[1] === 'true' : false,
            fullDefinition: match
          });
        }
      } catch (e) {
        console.error(`Error parsing node for ${providerId}:`, e.message);
      }
    });
  }

  return nodes;
}

// Convert node type to camelCase filename
function getFileName(nodeType, isTrigger) {
  // Remove provider prefix and convert to camelCase
  const parts = nodeType.split('_');
  const prefix = parts[0]; // provider name
  const typeIndicator = parts[1]; // 'action' or 'trigger'
  const name = parts.slice(2).join('_'); // actual action/trigger name

  // Convert snake_case to camelCase
  const camelName = name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

  return camelName || 'default';
}

// Generate schema file content
function generateSchemaContent(node, providerId) {
  const fileName = getFileName(node.type, node.isTrigger);
  const schemaName = `${fileName}${node.isTrigger ? 'Trigger' : 'Action'}Schema`;

  // Clean up the full definition for embedding
  let cleanDefinition = node.fullDefinition
    .replace(/^\s*\{/, '')  // Remove opening brace
    .replace(/\}\s*$/, '')  // Remove closing brace
    .replace(/icon:\s*[A-Za-z]+,?/, `icon: "${node.icon}" as any,`) // Quote icon
    .trim();

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

  // Generate imports
  const iconImports = `import { ${uniqueIcons.join(', ')} } from "lucide-react"`;

  // Generate action imports
  const actionImports = actions.map(a => {
    const fileName = getFileName(a.type, false);
    return `import { ${fileName}ActionSchema } from "./actions/${fileName}.schema"`;
  }).join('\n');

  // Generate trigger imports
  const triggerImports = triggers.map(t => {
    const fileName = getFileName(t.type, true);
    return `import { ${fileName}TriggerSchema } from "./triggers/${fileName}.schema"`;
  }).join('\n');

  // Generate icon applications
  const actionApplications = actions.map(a => {
    const fileName = getFileName(a.type, false);
    const iconName = ICON_MAP[a.icon] || 'FileText';
    return `const ${fileName}: NodeComponent = {
  ...${fileName}ActionSchema,
  icon: ${iconName}
}`;
  }).join('\n\n');

  const triggerApplications = triggers.map(t => {
    const fileName = getFileName(t.type, true);
    const iconName = ICON_MAP[t.icon] || 'FileText';
    return `const ${fileName}: NodeComponent = {
  ...${fileName}TriggerSchema,
  icon: ${iconName}
}`;
  }).join('\n\n');

  // Generate exports
  const allExports = [
    ...actions.map(a => getFileName(a.type, false)),
    ...triggers.map(t => getFileName(t.type, true))
  ];

  return `${iconImports}
import { NodeComponent } from "../../types"

${actionImports ? '// Import action schemas\n' + actionImports : ''}

${triggerImports ? '// Import trigger schemas\n' + triggerImports : ''}

${actionApplications ? '// Apply icons to actions\n' + actionApplications : ''}

${triggerApplications ? '// Apply icons to triggers\n' + triggerApplications : ''}

// Export all ${providerId} nodes
export const ${providerId}Nodes: NodeComponent[] = [
  ${allExports.join(',\n  ')}
]

// Export individual nodes for direct access
export {
  ${allExports.join(',\n  ')}
}`;
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
    const fileName = getFileName(node.type, node.isTrigger);
    const dir = node.isTrigger ? triggersDir : actionsDir;
    const filePath = path.join(dir, `${fileName}.schema.ts`);
    const content = generateSchemaContent(node, providerId);

    fs.writeFileSync(filePath, content);
    console.log(`  ✓ Created ${node.isTrigger ? 'trigger' : 'action'}: ${fileName}.schema.ts`);
  });

  // Write index file
  const indexPath = path.join(providerDir, 'index.ts');
  const indexContent = generateIndexContent(providerId, nodes);
  fs.writeFileSync(indexPath, indexContent);
  console.log(`  ✓ Created index.ts for ${providerId}`);
}

// Extract all unique provider IDs from the content
function extractProviderIds(content) {
  const providerPattern = /providerId:\s*["']([^"']+)["']/g;
  const providers = new Set();
  let match;

  while ((match = providerPattern.exec(content)) !== null) {
    providers.add(match[1]);
  }

  return Array.from(providers).filter(p => !SKIP_PROVIDERS.includes(p));
}

// Main migration function
function migrateNodes() {
  console.log('🚀 Starting automated node migration...\n');

  const content = readSourceFile();
  const providers = extractProviderIds(content);

  console.log(`Found ${providers.length} providers to migrate:`);
  console.log(providers.join(', '));
  console.log('');

  let totalNodes = 0;

  providers.forEach(providerId => {
    console.log(`\n📦 Processing ${providerId}...`);
    const nodes = extractProviderNodes(content, providerId);

    if (nodes.length > 0) {
      console.log(`  Found ${nodes.length} nodes (${nodes.filter(n => !n.isTrigger).length} actions, ${nodes.filter(n => n.isTrigger).length} triggers)`);
      writeProviderFiles(providerId, nodes);
      totalNodes += nodes.length;
    } else {
      console.log(`  ⚠️  No nodes found for ${providerId}`);
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