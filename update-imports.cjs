const fs = require('fs');
const path = require('path');

// Files to update
const filesToUpdate = [
  "app/api/cron/poll-triggers/route.ts",
  "app/api/workflows/execute/route-original-backup.ts",
  "app/api/workflows/node-outputs/route.ts",
  "app/api/workflows/test-node/route.ts",
  "app/api/workflows/test-workflow-segment/route.ts",
  "components/webhooks/WebhookConfigurationPanel.tsx",
  "components/workflows/CollaborativeWorkflowBuilder.tsx",
  "components/workflows/configuration/fields/EnhancedFileInput.tsx",
  "components/workflows/configuration/fields/FieldRenderer.tsx",
  "components/workflows/configuration/hooks/useFormState.ts",
  "components/workflows/configuration/utils/types.ts",
  "components/workflows/configuration/utils/validation.ts",
  "components/workflows/configuration/VariablePickerSidePanel.tsx",
  "components/workflows/CustomNode.tsx",
  "components/workflows/TriggerOutputSelector.tsx",
  "lib/execution/advancedExecutionEngine.ts",
  "lib/services/nodeExecutionService.ts",
  "lib/webhooks/integrationWebhookService.ts",
  "lib/webhooks/triggerWebhookManager.ts",
  "lib/webhooks/webhookManager.ts",
  "lib/workflows/smartAIAgent.ts"
];

const replacements = [
  // Absolute imports
  { from: 'from "@/lib/workflows/availableNodes"', to: 'from "@/lib/workflows/nodes"' },
  // Relative imports
  { from: "from './availableNodes'", to: "from './nodes'" },
  { from: "from '../availableNodes'", to: "from '../nodes'" },
  { from: "from '../../availableNodes'", to: "from '../../nodes'" },
  { from: "from '../workflows/availableNodes'", to: "from '../workflows/nodes'" },
  { from: "from '../../workflows/availableNodes'", to: "from '../../workflows/nodes'" },
];

let updatedCount = 0;

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    replacements.forEach(({ from, to }) => {
      if (content.includes(from)) {
        content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
        changed = true;
      }
    });
    
    if (changed) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated: ${file}`);
      updatedCount++;
    } else {
      console.log(`⏭️  No changes needed: ${file}`);
    }
  } else {
    console.log(`❌ File not found: ${file}`);
  }
});

console.log(`\n✨ Updated ${updatedCount} files`);
console.log(`📝 Remember to also update the executeNode.ts file to import from the new location if needed`);