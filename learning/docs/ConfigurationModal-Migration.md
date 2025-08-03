---
title: ConfigurationModal Migration Guide
date: 2023-08-03
component: ConfigurationModal
---

# ConfigurationModal Migration Guide

This guide provides instructions for migrating from the monolithic `ConfigurationModal.tsx` to the refactored, modular implementation.

## Overview

The original `ConfigurationModal.tsx` file has been refactored into a modular architecture with separate components for:

1. Modal container
2. Form handling
3. Field rendering
4. Integration-specific logic

## Updating Import Paths

### Before Refactoring

```tsx
// Importing the ConfigurationModal
import ConfigurationModal from "@/components/workflows/ConfigurationModal";

// Using the ConfigurationModal
<ConfigurationModal
  isOpen={isOpen}
  onClose={handleClose}
  onSave={handleSave}
  nodeInfo={selectedNode}
  integrationName={getIntegrationName(selectedNode?.providerId)}
  initialData={initialConfig}
  workflowData={workflowData}
  currentNodeId={selectedNode?.id}
/>
```

### After Refactoring

```tsx
// Importing the ConfigurationModal
import { ConfigurationModal } from "@/components/workflows/configuration";

// Using the ConfigurationModal (unchanged)
<ConfigurationModal
  isOpen={isOpen}
  onClose={handleClose}
  onSave={handleSave}
  nodeInfo={selectedNode}
  integrationName={getIntegrationName(selectedNode?.providerId)}
  initialData={initialConfig}
  workflowData={workflowData}
  currentNodeId={selectedNode?.id}
/>
```

## Migration Steps

1. **Update Imports**: Change all imports from `ConfigurationModal` to use the new path:
   ```tsx
   import { ConfigurationModal } from "@/components/workflows/configuration";
   ```

2. **Review Props**: The props interface remains the same, but you can now import types directly:
   ```tsx
   import { ConfigurationModalProps } from "@/components/workflows/configuration";
   ```

3. **Test Integration**: After updating imports, thoroughly test each node type to ensure functionality is preserved.

## Adding Custom Node Types

If you need to add custom configuration for specific node types:

1. Create a new file in the `components/workflows/configuration/nodes/` directory:
   ```tsx
   // Example: SlackNodeConfig.tsx
   import { NodeComponent } from "@/lib/workflows/availableNodes";
   
   interface SlackNodeConfigProps {
     nodeInfo: NodeComponent;
     // other props...
   }
   
   export function SlackNodeConfig({ nodeInfo, ...props }: SlackNodeConfigProps) {
     // Slack-specific configuration logic
     return (
       // Component JSX
     );
   }
   ```

2. Import and use it in the `ConfigurationForm.tsx` component.

## Accessing Hooks Directly

You can now use the form hooks directly in your components:

```tsx
import { useFormState, useDynamicOptions } from "@/components/workflows/configuration";

function MyCustomForm() {
  const { values, setValue, errors, handleSubmit } = useFormState(initialValues, nodeInfo);
  const { dynamicOptions, loading, loadOptions } = useDynamicOptions({ 
    nodeType: nodeInfo?.type,
    providerId: nodeInfo?.providerId 
  });
  
  // Component logic...
}
```

## Common Issues

### Missing Field Functionality

If your node type requires special field handling that's not included in the base implementation:

1. Check if it needs a custom field renderer
2. Create a specialized field component in the `fields/` directory
3. Import it in the `FieldRenderer.tsx` component

### Integration-Specific Logic

Some integrations require specific data fetching or validation logic. For these cases:

1. Create a custom hook in the `hooks/` directory
2. Create a node-specific configuration component in the `nodes/` directory

## Testing Your Changes

After migration, verify:

1. The form renders correctly for all node types
2. Dynamic field options load properly
3. Validation works as expected
4. Form submission sends the correct data

## Getting Help

If you encounter issues during migration:

1. Check the `learning/walkthroughs/ConfigurationModal.md` file for detailed component documentation
2. Review the example implementations in the `components/workflows/configuration/` directory
3. Compare your usage with the original implementation if needed