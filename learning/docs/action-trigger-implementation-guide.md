# Action & Trigger Implementation Deep-Dive
**Updated: March 2026 — Current Architecture**

This guide supplements the [Complete Integration Guide](./complete-integration-guide-2025.md) with deep-dive details on action handlers, trigger lifecycle, error handling patterns, and troubleshooting. Read the main guide first for the step-by-step process.

---

## Table of Contents

1. [ActionResult Interface](#actionresult-interface)
2. [Action Handler Patterns](#action-handler-patterns)
3. [Trigger Lifecycle Architecture](#trigger-lifecycle-architecture)
4. [ConfigField Reference](#configfield-reference)
5. [Output Schema & Variable Picker](#output-schema--variable-picker)
6. [Error Handling](#error-handling)
7. [Troubleshooting](#troubleshooting)
8. [Provider-Specific Notes](#provider-specific-notes)

---

## ActionResult Interface

**File:** `lib/workflows/actions/core/executeWait.ts`

Every action handler must return this interface:

```typescript
interface ActionResult {
  success: boolean                    // REQUIRED
  output?: Record<string, any>        // Data for downstream nodes (must match outputSchema)
  message?: string                    // User-friendly message for logs
  error?: string                      // Error details
  data?: any                          // Alias for output
  metadata?: Record<string, any>      // Execution metadata
  selectedPaths?: string[]            // For branching logic (path router nodes)
  pauseExecution?: boolean            // Pause workflow (wait-for-event nodes)
}
```

**Key rules:**
- `output` keys must match `outputSchema` field names from the node schema
- On failure, return `{ success: false }` rather than throwing — gives you control over the error message
- The execution engine (`lib/workflows/executeNode.ts:685-718`) validates `result.success === false` and throws automatically

---

## Action Handler Patterns

### Standard Handler Signature

**File:** `lib/workflows/actions/{provider}/{action}.ts`

```typescript
import { resolveValue } from '../core/resolveValue'
import { getDecryptedAccessToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

export async function yourAction(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Resolve variables (handles {{nodeId.field}} references)
    const fieldValue = await resolveValue(config.fieldName, input)

    // 2. Validate required fields
    if (!fieldValue) throw new Error('Field is required')

    // 3. Get credentials
    const accessToken = await getDecryptedAccessToken(userId, 'yourprovider')

    // 4. API call
    const response = await fetch(...)

    // 5. Return success
    return {
      success: true,
      output: { /* matches outputSchema */ },
      message: 'Action completed',
    }
  } catch (error: any) {
    logger.error('Action error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Action failed',
    }
  }
}
```

### Registry Registration

**File:** `lib/workflows/actions/registry.ts`

```typescript
// Handler key MUST match node schema `type` exactly
"yourprovider_action_create_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
  createRecord(params.config, params.userId, params.input),
```

The execution engine calls handlers via:
```typescript
// executeNode.ts line 679
const result = await handler({ config: processedConfig, userId, input, context: executionContext })
```

### Pattern: Multiple Operations with Error Collection

```typescript
const results = []
const errors = []

for (const item of items) {
  try {
    results.push(await processItem(item))
  } catch (error: any) {
    errors.push(`${item.id}: ${error.message}`)
  }
}

return {
  success: results.length > 0,
  output: { processed: results.length, failed: errors.length, errors },
  message: `Processed ${results.length} of ${items.length} items`,
}
```

### Pattern: Rich Error Data

```typescript
catch (error: any) {
  return {
    success: false,
    output: {
      attemptedEmail: email,
      partialResults: processedSoFar,   // Useful for debugging
    },
    message: `Failed to send email to ${email}: ${error.message}`,
    error: error.message,
  }
}
```

---

## Trigger Lifecycle Architecture

### Core Types

**File:** `lib/triggers/types.ts`

```typescript
interface TriggerActivationContext {
  workflowId: string
  userId: string
  nodeId: string
  triggerType: string           // e.g., "yourprovider_trigger_new_record"
  providerId: string            // e.g., "yourprovider"
  config: TriggerConfig         // Node configuration from user
  webhookUrl?: string
  testMode?: {
    isTest: true
    testSessionId: string
  }
}

interface TriggerDeactivationContext {
  workflowId: string
  userId: string
  providerId: string
  nodeId?: string
  testSessionId?: string        // If deactivating test-only resources
}

interface TriggerHealthStatus {
  healthy: boolean
  details?: string
  message?: string
  expiresAt?: string
  lastChecked?: string
}

interface TriggerLifecycle {
  onActivate(context: TriggerActivationContext): Promise<void>
  onDeactivate(context: TriggerDeactivationContext): Promise<void>
  onDelete(context: TriggerDeactivationContext): Promise<void>
  checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus>
  getResourceIdentityKeys?(): string[]  // Optional: for smart update detection
}
```

### TriggerLifecycleManager

**File:** `lib/triggers/TriggerLifecycleManager.ts`

Key methods:

| Method | When Called | What It Does |
|--------|-----------|--------------|
| `registerProvider()` | App initialization | Registers provider lifecycle handler |
| `activateWorkflowTriggers()` | Workflow status → 'active' | Calls `onActivate()` for each trigger node |
| `deactivateWorkflowTriggers()` | Workflow status → 'inactive' | Finds trigger_resources, calls `onDeactivate()` |
| `deleteWorkflowTriggers()` | Workflow deleted | Calls `onDelete()` for all resources |
| `updateWorkflowTriggers()` | Workflow config changes | Smart updates with polling state preservation |
| `checkWorkflowTriggerHealth()` | Health check cron | Calls `checkHealth()` per provider |

### Three Trigger Patterns

**1. Webhook-Based (Airtable, Monday, Microsoft Graph)**
- `onActivate()` creates external webhook via API call
- Stores webhook ID in `trigger_resources.external_id`
- `onDeactivate()` deletes external webhook via API call
- Webhook endpoint receives events and routes to workflow

**2. Passive Listener (Slack, Discord)**
- Events come through existing infrastructure (Slack Events API, Discord Gateway)
- `onActivate()` only stores routing metadata (`resource_type: 'other'`)
- `onDeactivate()` just marks metadata as deleted
- No external API calls needed

**3. Polling (Google Sheets)**
- `onActivate()` initializes snapshot of current state (CRITICAL — prevents first-poll-miss bug)
- Stores initial snapshot in `trigger_resources.config`
- Polling cron job compares current state to snapshot
- Changes detected → workflow triggered

### Registration

**File:** `lib/triggers/index.ts`

```typescript
// Single provider
triggerLifecycleManager.registerProvider({
  providerId: 'yourprovider',
  lifecycle: new YourProviderTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Your Provider webhooks',
})

// Multiple providers sharing one lifecycle (e.g., Microsoft Graph)
const lifecycle = new MicrosoftGraphTriggerLifecycle()
for (const id of ['microsoft', 'microsoft-outlook', 'microsoft-excel', 'onedrive']) {
  triggerLifecycleManager.registerProvider({
    providerId: id,
    lifecycle,
    requiresExternalResources: true,
    description: `Microsoft Graph subscriptions for ${id}`,
  })
}
```

### trigger_resources Insertion Pattern

```typescript
const { error } = await getSupabase().from('trigger_resources').insert({
  workflow_id: workflowId,
  user_id: userId,
  provider: 'yourprovider',
  provider_id: 'yourprovider',
  trigger_type: triggerType,
  node_id: nodeId,
  resource_type: 'webhook',          // 'webhook' | 'subscription' | 'polling' | 'other'
  resource_id: webhookId,
  external_id: webhookId,            // ID in external system
  config: { integrationId, webhookUrl, /* trigger-specific data */ },
  status: 'active',
  expires_at: expiresAt || null,
  is_test: context.testMode?.isTest || false,
  test_session_id: context.testMode?.testSessionId || null,
})

// Handle FK constraint error for unsaved workflows in test mode
if (error?.code === '23503') {
  logger.warn('Could not store trigger resource (workflow may be unsaved)')
  return
}
if (error) throw new Error(`Failed to store: ${error.message}`)
```

For passive triggers, use **upsert**:

```typescript
await getSupabase().from('trigger_resources').upsert({
  ...fields,
  resource_type: 'other',
  resource_id: `${workflowId}-${nodeId}`,
}, {
  onConflict: 'provider,resource_type,resource_id',
})
```

---

## ConfigField Reference

### Field Properties

```typescript
interface ConfigField {
  name: string                    // Field key (camelCase)
  label: string                   // Display label
  type: string                    // See type table below
  required?: boolean
  placeholder?: string
  description?: string

  // Dynamic fields (select/multiselect/combobox)
  dynamic?: string                // Data handler key (e.g., "yourprovider_boards")
  loadOnMount?: boolean           // Load immediately on render
  dynamicParent?: string          // Parent field for cascading
  dependsOn?: string              // Field must have value before loading

  // Conditional visibility
  hidden?: {
    $deps: string[]               // Fields to watch
    $condition: Record<string, any>  // e.g., { boardId: { $exists: false } }
  }

  // AI & variable support
  supportsAI?: boolean            // Can use {{AI_FIELD:fieldName}}
  hasVariablePicker?: boolean     // Shows variable picker UI

  // Validation
  min?: number
  max?: number
  rows?: number                   // For textarea

  // Special
  disabled?: boolean              // Read-only
}
```

### Field Types

| type | Component | Use For |
|------|-----------|---------|
| `"select"` | Dropdown | Single selection from dynamic options |
| `"multiselect"` | Multi-select | Multiple selections |
| `"combobox"` | Searchable dropdown | Large option sets, typeahead |
| `"text"` | Text input | Short text, IDs |
| `"textarea"` | Multi-line | Messages, descriptions |
| `"number"` | Number input | Quantities, amounts |
| `"boolean"` | Toggle | On/off settings |
| `"json"` | JSON editor | Complex structured data |
| `"keyvalue"` | Key-value pairs | Metadata, headers |
| `"date"` | Date picker | Date fields |
| `"email"` | Email input | Email addresses |

### Cascading Fields Example

```typescript
configSchema: [
  {
    name: "boardId",
    label: "Board",
    type: "select",
    dynamic: "yourprovider_boards",
    required: true,
    loadOnMount: true,
  },
  {
    name: "groupId",
    label: "Group",
    type: "select",
    dynamic: "yourprovider_groups",
    dynamicParent: "boardId",
    dependsOn: "boardId",
    hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
  },
  {
    name: "itemName",
    label: "Item Name",
    type: "text",
    required: true,
    supportsAI: true,
    hidden: { $deps: ["groupId"], $condition: { groupId: { $exists: false } } },
  },
]
```

---

## Output Schema & Variable Picker

### How It Works

1. Node schema defines `outputSchema` → what the node produces
2. `outputSchemaRegistry.ts` provides fallback definitions → used by variable picker
3. When a user selects a field like `{{nodeId.recordId}}`, the execution engine resolves it via `resolveValue()`

### Registration in outputSchemaRegistry.ts

**File:** `lib/workflows/actions/outputSchemaRegistry.ts`

```typescript
const OUTPUT_SCHEMA_REGISTRY: Record<string, OutputField[]> = {
  // Triggers
  'yourprovider_trigger_new_record': [
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'recordName', label: 'Record Name', type: 'string' },
  ],

  // Actions
  'yourprovider_action_create_record': [
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'recordName', label: 'Record Name', type: 'string' },
  ],
}
```

**Without this, the variable picker won't show outputs.** This is a common gotcha.

### Dynamic Schemas

For nodes where output depends on config (like Notion's unified manage_page):

```typescript
export function getActionOutputSchema(actionType: string, config?: any): OutputField[] {
  if (actionType === 'yourprovider_action_manage_record') {
    return getSchemaForOperation(config?.operation)
  }
  return OUTPUT_SCHEMA_REGISTRY[actionType] || []
}
```

---

## Error Handling

### How the Engine Handles Errors

**File:** `lib/workflows/executeNode.ts` (lines 685-718)

The engine checks `result.success === false` at multiple points and throws if failed:

```typescript
if (result.success === false) {
  const errorMessage = result.message || result.error || 'Action failed without error message'
  const error = new Error(errorMessage)
  // Logs full context including result.output and result.error
  throw error  // Fails the workflow execution
}
```

### Both Patterns Work

**Pattern 1: Return error (recommended)**
```typescript
return { success: false, output: {}, message: error.message }
```

**Pattern 2: Throw**
```typescript
throw new Error('Something went wrong')
```

Both result in: workflow fails, error logged, user sees failure in UI.

**Use Pattern 1** because you control the error message and can include partial output data for debugging.

---

## Troubleshooting

### "Unsupported data type" Error
**Cause:** Missing field mapping in `fieldMappings.ts`
**Fix:** Add mapping for your node type: `{ fieldName: "provider_resource_key" }`

### Action Not Found During Execution
**Cause:** Handler not in `registry.ts` or key doesn't match node `type`
**Fix:** Verify `actionHandlerRegistry` key matches node schema `type` exactly

### Trigger Resources Not Being Created
**Cause:** Provider ID mismatch between node schema and trigger registration
**Fix:** Check `providerId` in node schema vs `providerId` in `lib/triggers/index.ts`

Common mismatches:
| Node `providerId` | Wrong Registration | Correct Registration |
|-------------------|--------------------|---------------------|
| `microsoft-outlook` | `microsoft` | `microsoft-outlook` |
| `teams` | `microsoft-teams` | `teams` |

**Verify fix:**
```sql
SELECT * FROM trigger_resources WHERE workflow_id = 'your-workflow-id';
```

### Variable Picker Shows No Outputs
**Cause:** Missing entry in `outputSchemaRegistry.ts`
**Fix:** Add output fields to `OUTPUT_SCHEMA_REGISTRY` matching your node's `outputSchema`

### Dynamic Fields Not Loading
**Cause:** Data handler not registered
**Fix:** Check all three registration points:
1. Handler exists in `app/api/integrations/yourprovider/data/handlers/index.ts`
2. Provider registered in `lib/integrations/data-handler-registry-init.ts`
3. Field mapping exists in `components/workflows/configuration/config/fieldMappings.ts`

### "No integration found" Error
**Cause:** Provider name in DB doesn't match lookup
**Fix:** Check `dbProviderName` in `data-handler-registry-init.ts` matches `integrations.provider` column

---

## Provider-Specific Notes

### Microsoft Graph (Outlook, Teams, OneDrive, Excel)

**Webhook deduplication:** Microsoft can send duplicate notifications. Use the `microsoft_webhook_dedup` table:
```typescript
const dedupKey = isEmailNotification
  ? `${userId}:${messageId}`              // Email: ignore changeType
  : `${userId}:${messageId}:${changeType}` // Other: include changeType
```

**Change type:** Subscribe to ONLY `"created"` for new item triggers — Microsoft sends both "created" and "updated" for the same new email, causing duplicates.

**Folder filtering:** Deleting emails moves them to "Deleted Items" which triggers `created` notifications. Filter by `parentFolderId` to only process emails in the configured folder.

### Stripe

**Amount handling:** Stripe expects amounts in **cents** (smallest currency unit). Convert with `Math.round(parseFloat(amount) * 100)`.

**Nested data serialization:** Stripe uses `application/x-www-form-urlencoded` with bracket notation. Use `flattenForStripe()` from `lib/workflows/actions/stripe/utils.ts`.

### Polling Triggers (Google Sheets)

**Snapshot initialization in `onActivate()` is CRITICAL.** Without it, the first poll captures baseline and returns without triggering — events during that first cycle are silently dropped.

```typescript
// In onActivate():
const initialData = await fetchCurrentState(config)
const snapshot = buildSnapshot(initialData)
// Store snapshot in trigger_resources.config
```

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Main integration guide | `learning/docs/complete-integration-guide-2025.md` |
| Trigger types/interfaces | `lib/triggers/types.ts` |
| Trigger lifecycle manager | `lib/triggers/TriggerLifecycleManager.ts` |
| Trigger registry | `lib/triggers/index.ts` |
| Action handler registry | `lib/workflows/actions/registry.ts` |
| Execution engine | `lib/workflows/executeNode.ts` |
| Output schema registry | `lib/workflows/actions/outputSchemaRegistry.ts` |
| Node types | `lib/workflows/nodes/types.ts` |
| Field mappings | `components/workflows/configuration/config/fieldMappings.ts` |
| Provider options loader types | `components/workflows/configuration/providers/types.ts` |
| Provider loader registry | `components/workflows/configuration/providers/registry.ts` |
| Data handler registry | `lib/integrations/data-handler-registry.ts` |
| Data handler initialization | `lib/integrations/data-handler-registry-init.ts` |
| Shared data route handler | `lib/integrations/data-route-handler.ts` |
| Field implementation guide | `learning/docs/field-implementation-guide.md` |
