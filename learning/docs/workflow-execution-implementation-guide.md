# Workflow Execution Implementation Guide

## Overview
This guide documents the correct implementation patterns for workflow actions and integrations to ensure they execute properly. It captures lessons learned from debugging Gmail integration issues and provides a reference for implementing remaining workflow functionality.

## Architecture Overview

### Service Layer Architecture (Current/Correct)
```
WorkflowExecutionService
  ↓
NodeExecutionService
  ↓
ExecutionHandlers (Trigger/Action/Integration)
  ↓
Service Implementation (e.g., GmailIntegrationService)
  ↓
Direct Action Implementation (e.g., sendGmailEmail)
```

### Key Components

1. **ExecutionContext** - Carries critical data through execution:
   - `userId` - Required for authentication with external services
   - `workflowId` - Identifies the workflow being executed
   - `testMode` - Determines if actual API calls should be made
   - `data` - Input data and previous node outputs
   - `dataFlowManager` - Handles variable resolution and data flow

2. **Service Classes** - Handle node type routing and execution:
   - `IntegrationNodeHandlers` - Routes integration nodes to appropriate services
   - `ActionNodeHandlers` - Handles workflow actions (filters, delays, etc.)
   - `TriggerNodeHandlers` - Handles trigger nodes

## Implementation Patterns

### ✅ CORRECT: Direct Implementation Pattern

When implementing a new integration action, follow this pattern:

```typescript
// In lib/services/integrations/[Provider]IntegrationService.ts
export class ProviderIntegrationService {
  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type
    
    switch (nodeType) {
      case "provider_action_name":
        return await this.executeAction(node, context)
      // ... other actions
    }
  }

  private async executeAction(node: any, context: ExecutionContext) {
    const config = node.data.config || {}
    
    // Resolve configuration values using dataFlowManager
    const param1 = this.resolveValue(config.param1, context)
    const param2 = this.resolveValue(config.param2, context)
    
    // Validate required fields
    if (!param1) {
      throw new Error("Action requires 'param1' field")
    }
    
    // Handle test mode
    if (context.testMode) {
      return {
        type: "provider_action_name",
        status: "success (test mode)",
        // ... mock response
      }
    }
    
    // Import the actual implementation
    const { executeProviderAction } = await import('@/lib/workflows/actions/provider/action')
    
    // Call with proper parameters - userId comes from context!
    const result = await executeProviderAction(
      config,
      context.userId,  // Pass userId directly from context
      context.data || {}
    )
    
    return result
  }
  
  private resolveValue(value: any, context: ExecutionContext): any {
    if (!context.dataFlowManager) return value
    return context.dataFlowManager.resolveVariable(value)
  }
}
```

### ❌ INCORRECT: Legacy Fallback Pattern (Avoid!)

Do NOT use this pattern - it loses the userId:

```typescript
// DON'T DO THIS!
private async executeAction(node: any, context: ExecutionContext) {
  // ... validation ...
  
  if (context.testMode) {
    return { /* mock */ }
  }
  
  // This loses the userId!
  return await this.legacyService.executeFallbackAction(node, context)
}
```

## Critical Implementation Rules

### 1. Always Pass userId from ExecutionContext
The `userId` is essential for authentication with external services. It must be passed from the ExecutionContext to any function that needs authentication.

```typescript
// ✅ CORRECT
const result = await sendEmail(config, context.userId, context.data)

// ❌ INCORRECT - loses userId
const result = await legacyExecuteAction({ node, input, userId, workflowId })
```

### 2. Use DataFlowManager for Variable Resolution
Always resolve variables through the DataFlowManager to support dynamic values and data from previous nodes:

```typescript
// ✅ CORRECT
const to = this.resolveValue(config.to, context)

// ❌ INCORRECT
const to = config.to
```

### 3. Handle Test Mode Properly
Always check `context.testMode` before making actual API calls:

```typescript
if (context.testMode) {
  return {
    type: "action_type",
    status: "success (test mode)",
    // Return mock data that matches the expected output schema
  }
}
```

### 4. Preserve Context When Executing Connected Nodes
When passing context between nodes, ensure all properties are preserved:

```typescript
const updatedContext: ExecutionContext = {
  ...context,  // Preserves userId, workflowId, etc.
  data: { ...context.data, ...result }  // Merges new data
}
```

## Common Pitfalls and Solutions

### Pitfall 1: localStorage Not Available in Server Environment
**Problem**: Using `localStorage` in server-side code causes "localStorage is not defined" errors.

**Solution**: Check environment before using browser-only APIs:
```typescript
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  localStorage.setItem(key, value)
} else {
  console.log('Server-side execution:', value)
}
```

### Pitfall 2: UI Placeholder Nodes in Execution
**Problem**: UI nodes like "AddActionNode" being included in workflow execution.

**Solution**: Filter out UI-only nodes:
```typescript
const validNodes = nodes.filter((node: any) => {
  if (node.type === 'addAction' || node.id?.startsWith('add-action-')) {
    return false  // Skip UI placeholders
  }
  return true
})
```

### Pitfall 3: Mismatched Method Names
**Problem**: Using incorrect DataFlowManager method names (e.g., `resolveVariables` vs `resolveVariable`).

**Solution**: Use the correct singular form:
```typescript
// ✅ CORRECT
context.dataFlowManager.resolveVariable(value)
context.dataFlowManager.setNodeOutput(nodeId, output)

// ❌ INCORRECT
context.dataFlowManager.resolveVariables(value)  // Method doesn't exist
context.dataFlowManager.setNodeData(nodeId, output)  // Method doesn't exist
```

### Pitfall 4: Missing Handler Registration
**Problem**: New actions not executing because they're not registered.

**Solution**: Ensure all new handlers are registered in:
1. `actionHandlerRegistry` in `/lib/workflows/actions/registry.ts`
2. Node type checking in service classes
3. `executeNode.ts` for special handling

### Pitfall 5: Cookie Encoding Issues
**Problem**: Supabase cookies with "base64-" prefix causing JSON parsing errors.

**Solution**: Use raw cookie encoding:
```typescript
const supabase = createClient(url, key, {
  cookieEncoding: 'raw',  // Prevents base64- prefix
  // ... other options
})
```

## Implementation Checklist for New Actions

When implementing a new workflow action:

- [ ] **Define the node** in `/lib/workflows/availableNodes.ts`
- [ ] **Create the action handler** in `/lib/workflows/actions/[provider]/[action].ts`
- [ ] **Register the handler** in `/lib/workflows/actions/registry.ts`
- [ ] **Add field mappings** for dynamic fields in `useDynamicOptions.ts`
- [ ] **Create/Update service class** in `/lib/services/integrations/[Provider]IntegrationService.ts`
- [ ] **Route in ExecutionHandlers** - Ensure proper routing in `IntegrationNodeHandlers`
- [ ] **Implement data handlers** for dropdowns in `/app/api/integrations/[provider]/data/route.ts`
- [ ] **Test with actual userId** - Verify userId is passed correctly
- [ ] **Test in sandbox mode** - Ensure test mode returns appropriate mock data
- [ ] **Test in live mode** - Verify actual API calls work

## Testing Workflow Execution

### Debug Logging Points
Add these log statements when debugging execution issues:

```typescript
console.log(`📌 Context userId: ${context.userId}`)  // Track userId
console.log(`🔧 Executing node: ${node.id} (${node.data.type})`)  // Track node execution
console.log(`🔗 Node ${node.id} has ${connectedNodes.length} connected nodes`)  // Track flow
```

### Common Debug Scenarios

1. **"undefined userId" errors**: Check that context is passed correctly through all service layers
2. **"Method not found" errors**: Verify DataFlowManager method names are correct
3. **Actions not executing**: Check handler registration and node type routing
4. **No email sent despite "success"**: Verify actual API implementation is called, not mock

## Best Practices

1. **Avoid "Legacy" Systems**: If you see "legacy" in the code path, consider implementing directly in the new architecture
2. **Direct Imports**: Import and call action implementations directly rather than through multiple layers
3. **Type Safety**: Use TypeScript interfaces for ExecutionContext and node configurations
4. **Error Messages**: Provide clear, actionable error messages that indicate what's missing
5. **Consistent Patterns**: Follow the same pattern for all integrations to maintain consistency

## Examples of Correct Implementations

### Gmail Send Email (Fixed Implementation)
```typescript
private async executeSendEmail(node: any, context: ExecutionContext) {
  const config = node.data.config || {}
  const to = this.resolveValue(config.to, context)
  const subject = this.resolveValue(config.subject, context)
  const body = this.resolveValue(config.body, context)

  if (!to || !subject) {
    throw new Error("Gmail send email requires 'to' and 'subject' fields")
  }

  if (context.testMode) {
    return { /* mock response */ }
  }

  // Direct import and execution
  const { sendGmailEmail } = await import('@/lib/workflows/actions/gmail/sendEmail')
  return await sendGmailEmail(config, context.userId, context.data || {})
}
```

### Slack Send Message (Pattern to Follow)
```typescript
private async executeSendMessage(node: any, context: ExecutionContext) {
  const config = node.data.config || {}
  const channel = this.resolveValue(config.channel, context)
  const message = this.resolveValue(config.message, context)

  if (!channel || !message) {
    throw new Error("Slack send message requires 'channel' and 'message' fields")
  }

  if (context.testMode) {
    return { /* mock response */ }
  }

  const { sendSlackMessage } = await import('@/lib/workflows/actions/slack/sendMessage')
  return await sendSlackMessage(config, context.userId, context.data || {})
}
```

## Summary

The key to successful workflow execution is:
1. **Preserve the ExecutionContext** through all layers
2. **Pass userId directly** from context to action implementations
3. **Avoid legacy compatibility layers** that lose context
4. **Implement directly** in the new service architecture
5. **Test thoroughly** with both sandbox and live modes

When in doubt, follow the Gmail implementation pattern shown above - it's been battle-tested and works correctly.