# Complete Integration Development Guide
**Updated: March 2026 — Current Architecture**

This guide covers EVERYTHING needed to add a new integration from scratch. Follow these steps in order for a working integration on the first try. Every file path, code pattern, and registration step is verified against the current codebase.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Integration Metadata](#step-1-integration-metadata)
3. [Step 2: OAuth Registration](#step-2-oauth-registration)
4. [Step 3: Environment Variables](#step-3-environment-variables)
5. [Step 4: Provider Icon](#step-4-provider-icon)
6. [Step 5: Provider Display Name](#step-5-provider-display-name)
7. [Step 6: Node Schemas (Triggers & Actions)](#step-6-node-schemas)
8. [Step 7: Register Nodes](#step-7-register-nodes)
9. [Step 8: Data Handlers (Dynamic Field Options)](#step-8-data-handlers)
10. [Step 9: Field Mappings & Options Loader](#step-9-field-mappings--options-loader)
11. [Step 10: Action Handlers](#step-10-action-handlers)
12. [Step 11: Trigger Lifecycle](#step-11-trigger-lifecycle)
13. [Step 12: Webhook Endpoint](#step-12-webhook-endpoint)
14. [Step 13: Output Schema Registry](#step-13-output-schema-registry)
15. [Step 14: Testing Checklist](#step-14-testing-checklist)
16. [Quick Reference: All Files to Create/Modify](#quick-reference)

---

## Prerequisites

Before starting, gather:
- [ ] Provider's API documentation URL
- [ ] OAuth credentials (Client ID, Client Secret)
- [ ] OAuth scopes/permissions needed
- [ ] Provider's official icon (SVG preferred)
- [ ] List of actions and triggers to implement
- [ ] Webhook/subscription API docs (if triggers use webhooks)

---

## Step 1: Integration Metadata

**File:** `lib/integrations/availableIntegrations.ts`

Add your provider to `INTEGRATION_CONFIGS`:

```typescript
yourprovider: {
  id: "yourprovider",
  name: "Your Provider",
  description: "Short description of what this provider does",
  category: "productivity",  // communication | productivity | storage | crm | e-commerce | social | analytics
  capabilities: ["Create Items", "Update Records", "Send Messages"],
  scopes: ["read", "write"],
  isAvailable: true,
  requiresClientId: "YOURPROVIDER_CLIENT_ID",
  requiresClientSecret: "YOURPROVIDER_CLIENT_SECRET",
  color: "#FF3D57",
  docsUrl: "https://developer.yourprovider.com/docs",
  authType: "oauth",  // "oauth" or "apiKey"
},
```

---

## Step 2: OAuth Registration

**File:** `lib/integrations/provider-registry.ts`

Register your provider's OAuth config using the `register()` function. The system uses a **unified dynamic callback route** — you do NOT create per-provider callback files.

```typescript
register('yourprovider', {
  config: (baseUrl) => ({
    provider: 'yourprovider',
    tokenEndpoint: 'https://yourprovider.com/oauth2/token',
    clientId: process.env.YOURPROVIDER_CLIENT_ID!,
    clientSecret: process.env.YOURPROVIDER_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/yourprovider/callback`,
    transformTokenData: standardTransformTokenData,  // Use existing transformer or write custom
    additionalIntegrationData: async (tokenData) => {
      // Fetch user info after OAuth to store with integration
      try {
        const response = await fetch('https://api.yourprovider.com/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!response.ok) return {}
        const user = await response.json()
        return {
          email: user.email,
          username: user.name,
          account_name: user.name || user.email,
          provider_user_id: user.id,
        }
      } catch {
        return {}
      }
    },
  }),
})
```

**Available token transformers:**
- `standardTransformTokenData` — for providers with space-separated scopes (most providers)
- `googleTransformTokenData` — for Google OAuth
- `microsoftTransformTokenData` — for Microsoft OAuth
- Custom: return `{ access_token, refresh_token, scopes[], expires_at }`

**Optional `preHandler`:** If your provider has special callback handling (like Discord's bot flow), add a `preHandler` function that runs before the standard OAuth flow.

### Auth URL Generation

**File:** `app/api/integrations/auth/generate-url/route.ts`

Add a case for your provider in the switch statement:

```typescript
case "yourprovider":
  authUrl = generateYourProviderAuthUrl(finalState)
  break
```

Then define the URL generator function in the same file:

```typescript
function generateYourProviderAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOURPROVIDER_CLIENT_ID!,
    redirect_uri: `${getBaseUrl()}/api/integrations/yourprovider/callback`,
    response_type: 'code',
    scope: 'read write',
    state,
  })
  return `https://yourprovider.com/oauth2/authorize?${params.toString()}`
}
```

**The callback is handled automatically** by `app/api/integrations/[id]/callback/route.ts` — it looks up your provider in the registry and processes the OAuth exchange. No per-provider callback file needed.

---

## Step 3: Environment Variables

**File:** `.env.local`

```bash
YOURPROVIDER_CLIENT_ID=your_client_id_here
YOURPROVIDER_CLIENT_SECRET=your_client_secret_here
```

---

## Step 4: Provider Icon

**File:** `public/integrations/yourprovider.svg`

- Format: SVG (< 10KB)
- Colors: Official brand colors
- Convention: filename matches provider ID exactly

---

## Step 5: Provider Display Name

**File:** `lib/workflows/builder/providerNames.ts`

```typescript
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  // ... existing providers
  yourprovider: 'Your Provider',
}
```

---

## Step 6: Node Schemas

Nodes are organized in a modular structure under `lib/workflows/nodes/providers/`.

### Directory Structure

```
lib/workflows/nodes/providers/yourprovider/
├── index.ts                          # Aggregates all nodes, applies icons
├── triggers/
│   └── newRecord.schema.ts           # One file per trigger
└── actions/
    ├── createRecord.schema.ts        # One file per action
    └── updateRecord.schema.ts
```

### 6.1 Trigger Schema

**File:** `lib/workflows/nodes/providers/yourprovider/triggers/newRecord.schema.ts`

```typescript
import { NodeComponent } from "../../../types"

export const newRecordTriggerSchema: NodeComponent = {
  type: "yourprovider_trigger_new_record",       // Format: {provider}_trigger_{name}
  title: "New Record Created",
  description: "Triggers when a new record is created",
  icon: "FileText" as any,                        // Will be overridden in index.ts
  isTrigger: true,                                // REQUIRED: true for triggers
  providerId: "yourprovider",
  category: "Productivity",
  producesOutput: true,

  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "yourprovider_boards",             // Links to data handler key
      required: true,
      loadOnMount: true,                          // Load options immediately
      placeholder: "Select a board...",
      description: "The board to monitor",
    },
    {
      name: "groupId",
      label: "Group",
      type: "select",
      dynamic: "yourprovider_groups",
      dynamicParent: "boardId",                   // Parent field for cascading
      dependsOn: "boardId",                       // Only loads after parent is set
      required: false,
      placeholder: "Any group",
      hidden: {                                   // Hide until parent is selected
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } },
      },
    },
  ],

  outputSchema: [
    { name: "recordId", label: "Record ID", type: "string", description: "The ID of the new record" },
    { name: "recordName", label: "Record Name", type: "string", description: "The name of the record" },
    { name: "createdAt", label: "Created At", type: "string", description: "When the record was created" },
    { name: "creatorId", label: "Creator ID", type: "string", description: "ID of user who created it" },
  ],
}
```

### 6.2 Action Schema

**File:** `lib/workflows/nodes/providers/yourprovider/actions/createRecord.schema.ts`

```typescript
import { NodeComponent } from "../../../types"

export const createRecordActionSchema: NodeComponent = {
  type: "yourprovider_action_create_record",     // Format: {provider}_action_{name}
  title: "Create Record",
  description: "Create a new record",
  icon: "Plus" as any,
  isTrigger: false,                               // REQUIRED: false for actions
  providerId: "yourprovider",
  category: "Productivity",
  testable: true,                                 // Can be tested from UI
  producesOutput: true,

  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "yourprovider_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
    },
    {
      name: "recordName",
      label: "Record Name",
      type: "text",
      required: true,
      placeholder: "New record",
      supportsAI: true,                           // Can use {{AI_FIELD:recordName}}
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } },
      },
    },
  ],

  outputSchema: [
    { name: "recordId", label: "Record ID", type: "string", description: "The ID of the created record" },
    { name: "recordName", label: "Record Name", type: "string", description: "The name of the record" },
    { name: "boardId", label: "Board ID", type: "string", description: "The board containing the record" },
    { name: "createdAt", label: "Created At", type: "string", description: "When the record was created" },
  ],
}
```

### 6.3 Provider Index (Aggregator)

**File:** `lib/workflows/nodes/providers/yourprovider/index.ts`

```typescript
import { Plus, FileText } from "lucide-react"
import { NodeComponent } from "../../types"

// Import trigger schemas
import { newRecordTriggerSchema } from "./triggers/newRecord.schema"

// Import action schemas
import { createRecordActionSchema } from "./actions/createRecord.schema"

// Apply icons (schemas use placeholder icons, this is where real icons are set)
const newRecordTrigger: NodeComponent = { ...newRecordTriggerSchema, icon: FileText }
const createRecord: NodeComponent = { ...createRecordActionSchema, icon: Plus }

// Export all nodes as a single array
export const yourproviderNodes: NodeComponent[] = [
  // Triggers
  newRecordTrigger,
  // Actions
  createRecord,
]
```

### ConfigField Type Reference

Common field types for `configSchema`:

| type | Description | Key Properties |
|------|------------|----------------|
| `"select"` | Dropdown | `dynamic`, `dependsOn`, `loadOnMount` |
| `"text"` | Text input | `supportsAI`, `hasVariablePicker` |
| `"textarea"` | Multi-line text | `supportsAI` |
| `"number"` | Number input | `min`, `max` |
| `"boolean"` | Toggle | — |
| `"json"` | JSON editor | — |
| `"multiselect"` | Multi-select | `dynamic` |
| `"combobox"` | Searchable select | `dynamic` |
| `"keyvalue"` | Key-value pairs | — |
| `"date"` | Date picker | — |

### Cascading (Dependent) Fields

Use these properties together for parent→child field relationships:

```typescript
{
  name: "childField",
  dynamic: "yourprovider_child_data",   // Data handler key
  dynamicParent: "parentField",          // Which field to read parent value from
  dependsOn: "parentField",             // Won't load until parent has value
  hidden: {                              // Hide until parent selected
    $deps: ["parentField"],
    $condition: { parentField: { $exists: false } },
  },
}
```

---

## Step 7: Register Nodes

**File:** `lib/workflows/nodes/index.ts`

```typescript
// Add import
import { yourproviderNodes } from "./providers/yourprovider"

// Add to BASE_NODE_COMPONENTS array
const BASE_NODE_COMPONENTS: NodeComponent[] = [
  // ... existing providers
  ...yourproviderNodes,
]
```

---

## Step 8: Data Handlers (Dynamic Field Options)

Data handlers power the dynamic select fields. The system uses a **shared handler framework** — your data route is a thin adapter.

### 8.1 Provider Types

**File:** `app/api/integrations/yourprovider/data/types.ts`

```typescript
export interface YourProviderIntegration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  scopes?: string[]
  status: string
  metadata?: any
  created_at: string
  updated_at: string
}

export type YourProviderDataHandler<T = any> = (
  integration: YourProviderIntegration,
  options?: Record<string, any>
) => Promise<T[]>
```

### 8.2 Provider Utilities

**File:** `app/api/integrations/yourprovider/data/utils.ts`

```typescript
import { logger } from '@/lib/utils/logger'
import { decryptToken } from '@/lib/security/tokenUtils'
import { YourProviderIntegration } from './types'

export function validateIntegration(integration: YourProviderIntegration): void {
  if (!integration) throw new Error('Integration not found')
  if (!integration.access_token) throw new Error('Access token is missing')
  if (integration.status !== 'connected' && integration.status !== 'active') {
    throw new Error(`Integration is not connected (status: ${integration.status})`)
  }
}

export async function getAccessToken(integration: YourProviderIntegration): Promise<string> {
  const decrypted = await decryptToken(integration.access_token)
  if (typeof decrypted !== 'string' || decrypted.length === 0) {
    throw new Error('Invalid access token format')
  }
  return decrypted
}

export async function makeApiRequest(
  endpoint: string,
  accessToken: string,
  options?: { method?: string; body?: any }
): Promise<any> {
  const response = await fetch(endpoint, {
    method: options?.method || 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error: ${response.status} - ${errorText}`)
  }

  return response.json()
}
```

### 8.3 Individual Data Handlers

**File:** `app/api/integrations/yourprovider/data/handlers/boards.ts`

```typescript
import { YourProviderIntegration, YourProviderDataHandler } from '../types'
import { validateIntegration, getAccessToken, makeApiRequest } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getBoards: YourProviderDataHandler = async (integration) => {
  try {
    validateIntegration(integration)
    const accessToken = await getAccessToken(integration)
    const data = await makeApiRequest('https://api.yourprovider.com/boards', accessToken)

    return (data.boards || []).map((board: any) => ({
      value: board.id,
      label: board.name,
      description: board.description,
    }))
  } catch (error: any) {
    logger.error('[YourProvider Boards] Error:', { message: error.message })
    throw new Error(`Failed to fetch boards: ${error.message}`)
  }
}
```

### 8.4 Handler Index

**File:** `app/api/integrations/yourprovider/data/handlers/index.ts`

```typescript
import { YourProviderDataHandler } from '../types'
import { getBoards } from './boards'
import { getGroups } from './groups'

export const yourproviderHandlers: Record<string, YourProviderDataHandler> = {
  'yourprovider_boards': getBoards,
  'yourprovider_groups': getGroups,
}
```

### 8.5 Data Route (Thin Adapter)

**File:** `app/api/integrations/yourprovider/data/route.ts`

```typescript
import { type NextRequest } from 'next/server'
import { handleIntegrationDataRequest } from '@/lib/integrations/data-route-handler'

export async function POST(req: NextRequest) {
  return handleIntegrationDataRequest('yourprovider', req)
}
```

### 8.6 Register Data Handlers

**File:** `lib/integrations/data-handler-registry-init.ts`

```typescript
import { yourproviderHandlers } from '@/app/api/integrations/yourprovider/data/handlers'

registerDataProvider('yourprovider', yourproviderHandlers, {
  dbProviderName: 'yourprovider',        // Provider name as stored in DB integrations table
  tokenDecryption: 'none',               // 'none' | 'decryptToken' | 'decrypt-with-key'
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',                  // 'none' | 'refresh-and-retry'
})
```

**Token decryption options:**
- `'none'` — pass integration as-is (token decrypted in handler utils)
- `'decryptToken'` — uses `tokenUtils.decryptToken` before passing to handler
- `'decrypt-with-key'` — uses `encryption.decrypt` with `ENCRYPTION_KEY`

---

## Step 9: Field Mappings & Options Loader

### 9.1 Field Mappings

**File:** `components/workflows/configuration/config/fieldMappings.ts`

Maps config field names to data handler keys:

```typescript
const yourproviderMappings: Record<string, FieldMapping> = {
  yourprovider_trigger_new_record: {
    boardId: "yourprovider_boards",
    groupId: "yourprovider_groups",
  },
  yourprovider_action_create_record: {
    boardId: "yourprovider_boards",
    groupId: "yourprovider_groups",
  },
}

// Add to the main export object:
export const fieldToResourceMap: NodeFieldMappings = {
  // ... existing mappings
  ...yourproviderMappings,
  default: defaultMappings,
}
```

### 9.2 Provider Options Loader (Optional — for complex field logic)

For most providers, the field mappings + data handlers are sufficient. Create a custom options loader only if you need:
- Custom debouncing/deduplication
- Complex field dependency chains
- Client-side data transformation

**File:** `components/workflows/configuration/providers/yourprovider/yourproviderOptionsLoader.ts`

```typescript
import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'
import { logger } from '@/lib/utils/logger'

export class YourProviderOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = ['boardId', 'groupId', 'recordId']

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'yourprovider' && this.supportedFields.includes(fieldName)
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, dependsOnValue, signal } = params

    if (!integrationId) return []

    try {
      const response = await fetch('/api/integrations/yourprovider/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: `yourprovider_${fieldName === 'boardId' ? 'boards' : 'groups'}`,
          options: { parentId: dependsOnValue },
        }),
        signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      return result.data || []
    } catch (error) {
      logger.error(`[YourProvider] Error loading ${fieldName}:`, error)
      return []
    }
  }

  getFieldDependencies(fieldName: string): string[] {
    if (fieldName === 'groupId') return ['boardId']
    return []
  }
}
```

**Register it in** `components/workflows/configuration/providers/registry.ts`:

```typescript
import { YourProviderOptionsLoader } from './yourprovider/yourproviderOptionsLoader'

// In registerDefaultLoaders():
this.register('yourprovider', new YourProviderOptionsLoader())
```

---

## Step 10: Action Handlers

### 10.1 Create Action Handler

**File:** `lib/workflows/actions/yourprovider/createRecord.ts`

```typescript
import { logger } from '@/lib/utils/logger'
import { resolveValue } from '../core/resolveValue'
import { getDecryptedAccessToken } from '@/lib/integrations/tokenUtils'

interface ActionResult {
  success: boolean
  output: Record<string, any>
  message: string
}

export async function createRecord(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Resolve config values (handles {{nodeId.field}} variables)
    const boardId = await resolveValue(config.boardId, input)
    const recordName = await resolveValue(config.recordName, input)

    // 2. Validate required fields
    if (!boardId) throw new Error('Board ID is required')
    if (!recordName) throw new Error('Record name is required')

    // 3. Get decrypted access token
    const accessToken = await getDecryptedAccessToken(userId, 'yourprovider')

    // 4. Make API call
    const response = await fetch('https://api.yourprovider.com/records', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ boardId, name: recordName }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }

    const record = await response.json()

    logger.info('Record created successfully', { recordId: record.id, userId })

    // 5. Return ActionResult — output keys MUST match outputSchema
    return {
      success: true,
      output: {
        recordId: record.id,
        recordName: record.name,
        boardId: boardId,
        createdAt: record.created_at,
      },
      message: `Record "${recordName}" created successfully`,
    }
  } catch (error: any) {
    logger.error('Create record error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create record',
    }
  }
}
```

**Key rules:**
- Function signature: `(config, userId, input) => Promise<ActionResult>`
- Use `resolveValue()` to handle variable references like `{{nodeId.field}}`
- Use `getDecryptedAccessToken()` for credentials
- Return `{ success: true, output: {...}, message }` on success
- Return `{ success: false, output: {}, message }` on failure — do NOT throw
- `output` keys must match `outputSchema` field names exactly

### 10.2 Create Action Index

**File:** `lib/workflows/actions/yourprovider/index.ts`

```typescript
export { createRecord } from './createRecord'
export { updateRecord } from './updateRecord'
```

### 10.3 Register in Action Handler Registry

**File:** `lib/workflows/actions/registry.ts`

Add import at the top:
```typescript
import { createRecord, updateRecord } from './yourprovider'
```

Add entries to `actionHandlerRegistry`:
```typescript
export const actionHandlerRegistry: Record<string, Function> = {
  // ... existing handlers

  // Your Provider
  "yourprovider_action_create_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    createRecord(params.config, params.userId, params.input),

  "yourprovider_action_update_record": (params: { config: any; userId: string; input: Record<string, any> }) =>
    updateRecord(params.config, params.userId, params.input),
}
```

**The key MUST match the `type` field from the node schema exactly.**

---

## Step 11: Trigger Lifecycle

If your triggers use webhooks, subscriptions, or any external resources, you MUST implement the trigger lifecycle pattern.

### The Lifecycle Rule

```
User connects integration → Save OAuth credentials ONLY
User creates workflow     → Just configuration, no resources
User ACTIVATES workflow   → CREATE webhook/subscription
User DEACTIVATES workflow → DELETE webhook/subscription
User DELETES workflow     → DELETE all resources
```

### 11.1 Create Lifecycle Implementation

**File:** `lib/triggers/providers/YourProviderTriggerLifecycle.ts`

```typescript
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus,
} from '../types'
import { getSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { decryptToken } from '@/lib/security/tokenUtils'

export class YourProviderTriggerLifecycle implements TriggerLifecycle {

  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    // 1. Validate config
    const boardId = config?.boardId
    if (!boardId) throw new Error('Board ID is required for this trigger')

    // 2. Get integration credentials
    const integrationId = config?.integrationId || config?.workspace
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('id, access_token, status')
      .eq('id', integrationId)
      .eq('provider', 'yourprovider')
      .single()

    if (!integration) throw new Error('Integration not found')
    if (integration.status !== 'connected') throw new Error('Integration is not connected')

    // 3. Decrypt access token
    const accessToken = await decryptToken(integration.access_token)

    // 4. Create external resource (webhook/subscription)
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/yourprovider?workflowId=${workflowId}`

    const response = await fetch('https://api.yourprovider.com/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: [this.getEventType(triggerType)],
        boardId,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create webhook: ${error}`)
    }

    const webhook = await response.json()

    // 5. Store in trigger_resources table
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'yourprovider',
      provider_id: 'yourprovider',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: webhook.id,
      external_id: webhook.id,
      config: {
        integrationId,
        boardId,
        webhookUrl,
      },
      status: 'active',
      expires_at: webhook.expiresAt || null,
      is_test: context.testMode?.isTest || false,
      test_session_id: context.testMode?.testSessionId || null,
    })

    // Handle FK constraint error for unsaved workflows in test mode
    if (insertError?.code === '23503') {
      logger.warn('Could not store trigger resource (workflow may be unsaved)')
      return
    }
    if (insertError) throw new Error(`Failed to store trigger resource: ${insertError.message}`)

    logger.info('Trigger activated', { workflowId, triggerType, webhookId: webhook.id })
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    // 1. Find active resources
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider', 'yourprovider')
      .eq('status', 'active')

    if (!resources?.length) return

    // 2. Delete external webhooks
    for (const resource of resources) {
      try {
        const integrationId = resource.config?.integrationId
        const { data: integration } = await getSupabase()
          .from('integrations')
          .select('access_token')
          .eq('id', integrationId)
          .single()

        if (integration) {
          const accessToken = await decryptToken(integration.access_token)
          await fetch(`https://api.yourprovider.com/webhooks/${resource.external_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          })
        }
      } catch (error) {
        logger.warn('Failed to delete external webhook', { resourceId: resource.id, error })
      }

      // 3. Mark as deleted in DB
      await getSupabase()
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', resource.id)
    }

    logger.info('Trigger deactivated', { workflowId })
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider', 'yourprovider')
      .eq('status', 'active')

    if (!resources?.length) {
      return { healthy: false, message: 'No active trigger resources found' }
    }

    return { healthy: true, message: 'Trigger resources active', lastChecked: new Date().toISOString() }
  }

  private getEventType(triggerType: string): string {
    switch (triggerType) {
      case 'yourprovider_trigger_new_record': return 'record.created'
      case 'yourprovider_trigger_record_updated': return 'record.updated'
      default: return 'record.created'
    }
  }
}
```

### 11.2 Passive Trigger Pattern (No External Resources)

For providers where events come through existing infrastructure (e.g., Slack Events API, Discord Gateway), use the passive pattern — just store routing metadata:

```typescript
async onActivate(context: TriggerActivationContext): Promise<void> {
  const { workflowId, userId, nodeId, triggerType, config } = context
  const resourceId = `${workflowId}-${nodeId}`

  const { error } = await getSupabase().from('trigger_resources').upsert({
    workflow_id: workflowId,
    user_id: userId,
    provider: 'yourprovider',
    provider_id: 'yourprovider',
    trigger_type: triggerType,
    node_id: nodeId,
    resource_type: 'other',          // Not external, just routing metadata
    resource_id: resourceId,
    config: { ...config, eventType: this.getEventType(triggerType) },
    status: 'active',
  }, {
    onConflict: 'provider,resource_type,resource_id',
  })

  if (error?.code === '23503') return  // Unsaved workflow in test mode
  if (error) throw new Error(`Failed to store trigger resource: ${error.message}`)
}
```

### 11.3 Register Trigger Lifecycle

**File:** `lib/triggers/index.ts`

```typescript
import { YourProviderTriggerLifecycle } from './providers/YourProviderTriggerLifecycle'

triggerLifecycleManager.registerProvider({
  providerId: 'yourprovider',
  lifecycle: new YourProviderTriggerLifecycle(),
  requiresExternalResources: true,     // false for passive triggers
  description: 'Your Provider webhooks for record triggers',
})
```

### trigger_resources Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `workflow_id` | UUID | FK to workflows |
| `user_id` | UUID | Owner |
| `provider` | TEXT | e.g., 'yourprovider' |
| `provider_id` | TEXT | Same as provider |
| `trigger_type` | TEXT | e.g., 'yourprovider_trigger_new_record' |
| `node_id` | UUID | Workflow node ID |
| `resource_type` | TEXT | 'webhook' / 'subscription' / 'polling' / 'other' |
| `resource_id` | TEXT | Internal ID |
| `external_id` | TEXT | External webhook/subscription ID |
| `config` | JSONB | Trigger-specific config |
| `status` | TEXT | 'active' / 'expired' / 'deleted' / 'error' |
| `expires_at` | TIMESTAMPTZ | When resource expires |
| `is_test` | BOOLEAN | Test mode flag |
| `test_session_id` | TEXT | Test session ID |
| `created_at` | TIMESTAMPTZ | Created timestamp |
| `updated_at` | TIMESTAMPTZ | Updated timestamp |

---

## Step 12: Webhook Endpoint

If your triggers receive webhooks, create the endpoint.

**File:** `app/api/webhooks/yourprovider/route.ts`

```typescript
import { NextRequest } from 'next/server'
import { logger } from '@/lib/utils/logger'
import { processWebhookEvent } from '@/lib/webhooks/yourprovider-processor'

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()
  logger.info(`[YourProvider Webhook] Request received`, { requestId })

  try {
    // 1. Parse body
    const body = await request.json()

    // 2. Handle verification handshake (many providers require this)
    if (body.type === 'url_verification' || body.challenge) {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Extract workflow ID from query params or body
    const url = new URL(request.url)
    const workflowId = url.searchParams.get('workflowId')

    if (!workflowId) {
      logger.warn('No workflowId in webhook request')
      return new Response('OK', { status: 200 })
    }

    // 4. Process the event (find matching triggers, execute workflows)
    await processWebhookEvent(workflowId, body, requestId)

    return new Response('OK', { status: 200 })
  } catch (error: any) {
    logger.error(`[YourProvider Webhook] Error:`, { requestId, error: error.message })
    return new Response('Internal Server Error', { status: 500 })
  }
}
```

---

## Step 13: Output Schema Registry

If your node schemas have `outputSchema` defined, also add them to the fallback registry for the variable picker.

**File:** `lib/workflows/actions/outputSchemaRegistry.ts`

```typescript
const OUTPUT_SCHEMA_REGISTRY: Record<string, OutputField[]> = {
  // ... existing entries

  // Your Provider Triggers
  'yourprovider_trigger_new_record': [
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'recordName', label: 'Record Name', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
    { name: 'creatorId', label: 'Creator ID', type: 'string' },
  ],

  // Your Provider Actions
  'yourprovider_action_create_record': [
    { name: 'recordId', label: 'Record ID', type: 'string' },
    { name: 'recordName', label: 'Record Name', type: 'string' },
    { name: 'boardId', label: 'Board ID', type: 'string' },
    { name: 'createdAt', label: 'Created At', type: 'string' },
  ],
}
```

**These MUST match the `outputSchema` in the node schema.** Without this, the variable picker won't show outputs to users.

---

## Step 14: Testing Checklist

### OAuth Flow
- [ ] Initiate OAuth from integrations page
- [ ] Callback completes and token stored
- [ ] User info displayed correctly
- [ ] Token refresh works (if applicable)
- [ ] Reconnect flow works

### Node Display
- [ ] Nodes appear in node catalog
- [ ] Icons display correctly
- [ ] Categories are correct
- [ ] Descriptions are clear

### Dynamic Fields
- [ ] Root fields load data on mount
- [ ] Dependent fields load after parent selected
- [ ] Hidden fields appear/disappear correctly
- [ ] Error states handled gracefully
- [ ] Empty results handled

### Action Execution
- [ ] Actions complete successfully
- [ ] Output data matches outputSchema
- [ ] Error handling returns `{ success: false }` (not throw)
- [ ] Variable references `{{nodeId.field}}` resolve correctly
- [ ] Logging uses `logger` — never `console.log`, never logs tokens

### Trigger Lifecycle
- [ ] Connect integration → NO resources created
- [ ] Create workflow → NO resources created
- [ ] Activate workflow → Resources CREATED (check trigger_resources table)
- [ ] Webhook receives events → Workflow executes
- [ ] Deactivate workflow → Resources DELETED
- [ ] Delete workflow → All cleanup done

### Variable Picker
- [ ] Action outputs appear in variable picker for downstream nodes
- [ ] Trigger outputs appear in variable picker
- [ ] Output field names match exactly

---

## Quick Reference

### All Files to CREATE for a New Integration

```
# OAuth & Registration
lib/integrations/availableIntegrations.ts          ← ADD entry
lib/integrations/provider-registry.ts              ← ADD register() call
app/api/integrations/auth/generate-url/route.ts    ← ADD case + URL generator

# Visual
public/integrations/yourprovider.svg               ← CREATE icon
lib/workflows/builder/providerNames.ts             ← ADD display name

# Node Schemas
lib/workflows/nodes/providers/yourprovider/
├── index.ts                                       ← CREATE aggregator
├── triggers/newRecord.schema.ts                   ← CREATE per trigger
└── actions/createRecord.schema.ts                 ← CREATE per action
lib/workflows/nodes/index.ts                       ← ADD import + spread

# Data Handlers (Dynamic Fields)
app/api/integrations/yourprovider/data/
├── route.ts                                       ← CREATE thin adapter
├── types.ts                                       ← CREATE provider types
├── utils.ts                                       ← CREATE API helpers
└── handlers/
    ├── index.ts                                   ← CREATE handler registry
    └── boards.ts                                  ← CREATE per data type
lib/integrations/data-handler-registry-init.ts     ← ADD registerDataProvider()

# Field Configuration
components/workflows/configuration/config/fieldMappings.ts  ← ADD mappings
components/workflows/configuration/providers/yourprovider/   ← OPTIONAL loader
components/workflows/configuration/providers/registry.ts     ← OPTIONAL registration

# Action Handlers
lib/workflows/actions/yourprovider/
├── index.ts                                       ← CREATE exports
├── createRecord.ts                                ← CREATE per action
└── updateRecord.ts
lib/workflows/actions/registry.ts                  ← ADD to actionHandlerRegistry

# Trigger Lifecycle
lib/triggers/providers/YourProviderTriggerLifecycle.ts  ← CREATE lifecycle
lib/triggers/index.ts                                   ← ADD registerProvider()
app/api/webhooks/yourprovider/route.ts                  ← CREATE webhook endpoint

# Output Registry
lib/workflows/actions/outputSchemaRegistry.ts      ← ADD entries

# Environment
.env.local                                         ← ADD credentials
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Provider ID | lowercase, no hyphens if possible | `monday`, `airtable` |
| Trigger type | `{provider}_trigger_{name}` | `monday_trigger_new_item` |
| Action type | `{provider}_action_{name}` | `monday_action_create_item` |
| Data handler key | `{provider}_{resource}` | `monday_boards` |
| Lifecycle file | `{Provider}TriggerLifecycle.ts` | `MondayTriggerLifecycle.ts` |
| Webhook route | `/api/webhooks/{provider}/route.ts` | `/api/webhooks/monday/route.ts` |

### Time Estimates

- Simple integration (2-3 actions, no webhooks): **2-3 hours**
- Medium integration (5-8 actions, webhooks): **4-6 hours**
- Complex integration (10+ actions, advanced triggers): **8-12 hours**
