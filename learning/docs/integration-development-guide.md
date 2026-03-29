# Dynamic Fields & Options Architecture Guide
**Updated: March 2026 — Current Architecture**

This guide supplements the [Complete Integration Guide](./complete-integration-guide-2025.md) with deep-dive details on how dynamic field loading works — the system that powers select dropdowns, cascading fields, and options loading in the workflow configuration UI.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How Dynamic Fields Work (End-to-End)](#how-dynamic-fields-work)
3. [Field Mappings](#field-mappings)
4. [Data Handler Registry](#data-handler-registry)
5. [Provider Options Loaders](#provider-options-loaders)
6. [Common Patterns](#common-patterns)
7. [Testing & Troubleshooting](#testing--troubleshooting)

---

## Architecture Overview

### Key Files

```
components/workflows/configuration/
├── hooks/
│   └── useDynamicOptions.ts              # Main hook (2,596 lines) — orchestrates all field loading
├── providers/
│   ├── types.ts                          # ProviderOptionsLoader interface
│   ├── registry.ts                       # Provider loader registry
│   └── {provider}/
│       └── {provider}OptionsLoader.ts    # Provider-specific loading logic
├── config/
│   └── fieldMappings.ts                  # Maps field names to data handler keys
└── utils/
    ├── fieldFormatters.ts                # Data formatting utilities
    └── requestManager.ts                 # Request deduplication

lib/integrations/
├── data-handler-registry.ts              # Central handler registry
├── data-handler-registry-init.ts         # All provider registrations
└── data-route-handler.ts                 # Shared API route handler

app/api/integrations/{provider}/data/
├── route.ts                              # Thin adapter
├── types.ts                              # Provider types
├── utils.ts                              # Token handling, API helpers
└── handlers/
    ├── index.ts                          # Handler map export
    └── {dataType}.ts                     # Individual handlers
```

---

## How Dynamic Fields Work

When a user opens a node's configuration modal and a `select` field has `dynamic: "yourprovider_boards"`:

```
1. ConfigurationForm renders field with dynamic="yourprovider_boards"
     ↓
2. useDynamicOptions hook picks up the field
     ↓
3. Hook checks fieldMappings.ts to resolve "yourprovider_boards" data type
     ↓
4. Hook checks provider registry for a custom ProviderOptionsLoader
     ↓
5. If custom loader exists → loader.loadOptions() handles everything
   If no custom loader → hook makes POST to /api/integrations/{provider}/data
     ↓
6. data/route.ts delegates to handleIntegrationDataRequest()
     ↓
7. data-route-handler.ts looks up handler from data-handler-registry
     ↓
8. Handler fetches from external API, formats response
     ↓
9. Options returned as { value, label }[] to the select field
```

For **dependent fields** (e.g., "groups" depends on "boards"):
- The parent field's value change triggers the child field to reload
- `dependsOn` property tells the hook which parent to watch
- `dynamicParent` tells the API which field value to pass as a filter

---

## Field Mappings

**File:** `components/workflows/configuration/config/fieldMappings.ts`

Maps each node type's fields to their data handler keys:

```typescript
// Each node type defines which fields map to which data endpoints
const yourproviderMappings: Record<string, FieldMapping> = {
  yourprovider_trigger_new_record: {
    boardId: "yourprovider_boards",       // fieldName → data handler key
    groupId: "yourprovider_groups",
  },
  yourprovider_action_create_record: {
    boardId: "yourprovider_boards",
    groupId: "yourprovider_groups",
  },
}

// Export merged with all other providers
export const fieldToResourceMap: NodeFieldMappings = {
  ...gmailMappings,
  ...discordMappings,
  ...yourproviderMappings,
  default: defaultMappings,
}
```

**The data handler key (e.g., `"yourprovider_boards"`) must match a key in the handler registry** at `app/api/integrations/yourprovider/data/handlers/index.ts`.

---

## Data Handler Registry

### Central Registry

**File:** `lib/integrations/data-handler-registry.ts`

Defines how each provider's data requests are processed:

```typescript
interface ProviderDataConfig {
  dbProviderName: string | string[]     // Provider name(s) in integrations table
  tokenDecryption: 'decryptToken' | 'decrypt-with-key' | 'none'
  decryptRefreshToken: boolean
  validStatuses: string[]               // e.g., ['connected', 'active']
  tokenRefresh: 'none' | 'refresh-and-retry'
  transformHandlerCall?: (handler, integration, decryptedToken, options) => Promise<any>
}
```

### Initialization

**File:** `lib/integrations/data-handler-registry-init.ts`

```typescript
// Standard provider (token handled in handler utils)
registerDataProvider('yourprovider', yourproviderHandlers, {
  dbProviderName: 'yourprovider',
  tokenDecryption: 'none',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
})

// Provider with auto-decryption (Slack)
registerDataProvider('slack', slackHandlers, {
  dbProviderName: 'slack',
  tokenDecryption: 'decryptToken',
  decryptRefreshToken: true,
  validStatuses: ['connected', 'active', 'authorized'],
  tokenRefresh: 'none',
})

// Provider with custom handler call (GitHub — different function signature)
registerDataProvider('github', githubHandlers, {
  dbProviderName: 'github',
  tokenDecryption: 'decrypt-with-key',
  decryptRefreshToken: false,
  validStatuses: ['connected', 'active'],
  tokenRefresh: 'none',
  transformHandlerCall: async (handler, integration, decryptedToken, options) => {
    return handler(decryptedToken!, options)  // GitHub takes (token, options) not (integration, options)
  },
})
```

### Shared Route Handler

**File:** `lib/integrations/data-route-handler.ts`

All data routes delegate to this shared handler:

```typescript
export async function handleIntegrationDataRequest(
  provider: string,
  req: NextRequest
): Promise<Response>
```

It handles: handler lookup, integration fetch, status validation, token decryption, error handling, retry on auth failure, and structured logging.

### Per-Provider Data Route

**File:** `app/api/integrations/yourprovider/data/route.ts`

```typescript
import { type NextRequest } from 'next/server'
import { handleIntegrationDataRequest } from '@/lib/integrations/data-route-handler'

export async function POST(req: NextRequest) {
  return handleIntegrationDataRequest('yourprovider', req)
}
```

This is a thin adapter — all logic lives in the shared handler.

---

## Provider Options Loaders

For most providers, field mappings + data handlers are sufficient. Custom options loaders are needed for:
- Complex debouncing/deduplication
- Multi-step field dependency chains
- Client-side data transformation
- Special loading behavior (previews, linked records)

### Interface

**File:** `components/workflows/configuration/providers/types.ts`

```typescript
interface LoadOptionsParams {
  fieldName: string
  nodeType: string
  providerId: string
  integrationId?: string
  dependsOn?: string
  dependsOnValue?: any
  forceRefresh?: boolean
  extraOptions?: Record<string, any>
  formValues?: Record<string, any>
  signal?: AbortSignal
}

interface ProviderOptionsLoader {
  canHandle(fieldName: string, providerId: string): boolean
  loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]>
  formatOptions?(data: any[]): FormattedOption[]
  getFieldDependencies?(fieldName: string): string[]
  clearCache?(): void
}
```

### Implementation Example

**File:** `components/workflows/configuration/providers/yourprovider/yourproviderOptionsLoader.ts`

```typescript
import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types'

export class YourProviderOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = ['boardId', 'groupId']

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'yourprovider' && this.supportedFields.includes(fieldName)
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, dependsOnValue, signal } = params
    if (!integrationId) return []

    const dataType = fieldName === 'boardId' ? 'yourprovider_boards' : 'yourprovider_groups'

    const response = await fetch('/api/integrations/yourprovider/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        dataType,
        options: { parentId: dependsOnValue },
      }),
      signal,
    })

    if (!response.ok) return []
    const result = await response.json()
    return result.data || []
  }

  getFieldDependencies(fieldName: string): string[] {
    if (fieldName === 'groupId') return ['boardId']
    return []
  }
}
```

### Registration

**File:** `components/workflows/configuration/providers/registry.ts`

```typescript
import { YourProviderOptionsLoader } from './yourprovider/yourproviderOptionsLoader'

// In registerDefaultLoaders():
this.register('yourprovider', new YourProviderOptionsLoader())
```

The registry supports **multiple loaders per provider** (e.g., HubSpot has two — one for standard fields, one for dynamic custom properties).

### Currently Registered Providers

Discord, Airtable, HubSpot (x2), Gmail, Slack, Facebook, OneNote, Notion, Google Drive, Google Sheets, Dropbox, Outlook, Teams, Google Calendar, Excel, AI, GitHub, Monday, Mailchimp, Twitter, Google Analytics, Gumroad, Storage, ManyChat, Stripe

---

## Common Patterns

### Pattern: Dependent Field Loading

When "Groups" dropdown depends on which "Board" is selected:

**In node schema:**
```typescript
{
  name: "groupId",
  dynamic: "yourprovider_groups",
  dynamicParent: "boardId",
  dependsOn: "boardId",
  hidden: { $deps: ["boardId"], $condition: { boardId: { $exists: false } } },
}
```

**In data handler:**
```typescript
export const getGroups: DataHandler = async (integration, options) => {
  const { parentId } = options || {}  // parentId comes from dynamicParent field value
  if (!parentId) return []

  const data = await makeApiRequest(`/boards/${parentId}/groups`, accessToken)
  return data.map(g => ({ value: g.id, label: g.name }))
}
```

### Pattern: Linked/Dynamic Records

For fields that reference records in another table:

```typescript
if (fieldName.startsWith('dynamic_field_')) {
  const fieldId = fieldName.replace('dynamic_field_', '')
  return this.loadDynamicFieldOptions(fieldId, params)
}
```

### Pattern: Format Options Response

All data handlers should return `{ value, label }[]` format:

```typescript
return items.map(item => ({
  value: item.id,
  label: item.name || item.title || item.id,
  description: item.description,    // Optional — shown as subtitle
  icon: item.icon,                  // Optional — shown as icon
}))
```

---

## Testing & Troubleshooting

### Test Dynamic Fields Manually

```bash
# Test data handler directly
curl -X POST http://localhost:3000/api/integrations/yourprovider/data \
  -H "Content-Type: application/json" \
  -d '{"integrationId": "your-id", "dataType": "yourprovider_boards", "options": {}}'
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Unsupported data type" | Missing field mapping | Add to `fieldMappings.ts` |
| Empty dropdown | Handler returns `[]` | Check API response, token validity |
| Dependent field won't load | Missing `dependsOn`/`dynamicParent` | Add both properties to field schema |
| Options load but don't show | Wrong format | Return `{ value, label }[]` |
| Field loads on every keystroke | Missing debounce | Use custom ProviderOptionsLoader with debounce |
| "Integration not found" | Wrong `dbProviderName` | Check `data-handler-registry-init.ts` matches DB |

### Debug Checklist

1. **Field mapping exists?** → `fieldMappings.ts` has entry for your node type + field name
2. **Handler registered?** → `data-handler-registry-init.ts` has `registerDataProvider()` call
3. **Handler exported?** → `handlers/index.ts` exports the handler with matching key
4. **Data route exists?** → `app/api/integrations/yourprovider/data/route.ts` exists
5. **API returns data?** → Test handler directly with curl
6. **Format correct?** → Response is `{ data: [{ value, label }] }`

---

## Related Documentation

- [Complete Integration Guide](./complete-integration-guide-2025.md) — Step-by-step for new integrations
- [Action/Trigger Deep-Dive](./action-trigger-implementation-guide.md) — Error handling, trigger lifecycle
- [Field Implementation Guide](./field-implementation-guide.md) — All field types and validation
