# Action/Trigger Complete Implementation Guide

## Overview
This document provides a comprehensive checklist for implementing workflow actions and triggers from UI to backend execution. Following this guide ensures actions/triggers work completely end-to-end and maintain uniform structure across the codebase.

## Critical Implementation Checklist

### 1. Define Node in availableNodes.ts
**Location:** `/lib/workflows/availableNodes.ts`

```typescript
{
  type: "provider_action_name", // e.g., "google_docs_action_share_document"
  title: "Action Title",
  description: "Clear description of what this action does",
  icon: IconComponent, // Import from lucide-react
  providerId: "provider-name", // e.g., "google-docs"
  category: "Category", // e.g., "Productivity"
  isTrigger: false, // true for triggers
  requiredScopes: ["scope1", "scope2"], // OAuth scopes needed
  configSchema: [
    // All input fields (see field-implementation-guide.md)
  ],
  outputSchema: [ // For triggers and actions that produce output
    {
      name: "outputField",
      label: "Output Label",
      type: "string",
      description: "What this output contains"
    }
  ]
}
```

### 2. Create Action Handler Function
**Location:** `/lib/workflows/actions/[provider]/[action].ts` or `/lib/workflows/actions/[provider].ts`

```typescript
import { ActionResult } from './core/executeWait'
import { resolveValue } from './core/resolveValue'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'

export async function yourActionHandler(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Resolve configuration with workflow variables
    const resolvedConfig = resolveValue(config, { input })
    
    // 2. Destructure all fields from UI
    const { 
      field1, 
      field2,
      field3 = 'defaultValue' // Provide defaults for optional fields
    } = resolvedConfig

    // 3. Get access token for the provider
    const accessToken = await getDecryptedAccessToken(userId, 'provider-name')
    
    // 4. Initialize API client
    // Example for Google:
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const apiClient = google.service({ version: 'v3', auth: oauth2Client })
    
    // 5. Execute the action
    const result = await apiClient.method({
      // API parameters
    })
    
    // 6. Return standardized result
    return {
      success: true,
      output: {
        // All output fields defined in outputSchema
      },
      message: 'Success message for logs'
    }
    
  } catch (error: any) {
    console.error('Action error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to execute action'
    }
  }
}
```

### 3. Register Handler in executeNode.ts
**Location:** `/lib/workflows/executeNode.ts`

```typescript
// 1. Import the handler
import { yourActionHandler } from './actions/provider/action'

// 2. Add to actionHandlers object
const actionHandlers: Record<string, ActionHandler> = {
  // ... existing handlers
  "provider_action_name": yourActionHandler,
}
```

### 4. Add Field Mappings for Dynamic Fields
**Location:** `/components/workflows/configuration/hooks/useDynamicOptions.ts`

⚠️ **CRITICAL:** Skip this step = "Unsupported data type" errors!

```typescript
const fieldMappings = {
  // ... existing mappings
  provider_action_name: {
    fieldName: "data-type-identifier",
    // Add ALL dynamic fields here
  }
}
```

### 5. Implement Data Handlers for Dynamic Fields
**Location:** `/app/api/integrations/[provider]/data/handlers/[handler].ts`

```typescript
export const getDataType = async (integration: Integration, options?: any) => {
  // Fetch data from API
  const data = await fetchFromAPI(...)
  
  // Format for dropdown
  return data.map(item => ({
    value: item.id,
    label: item.name
  }))
}
```

### 6. Register Data Handlers
**Location:** `/app/api/integrations/[provider]/data/handlers/index.ts`

```typescript
export const handlers: Record<string, DataHandler> = {
  'data-type-identifier': getDataType,
  // ... other handlers
}
```

### 7. Handle Special UI Behavior (if needed)
**Location:** `/components/workflows/configuration/ConfigurationForm.tsx`

```typescript
// For preview functionality, dependent loading, etc.
if (nodeInfo?.type === 'provider_action_name') {
  if (fieldName === 'specialField') {
    // Special handling logic
  }
}
```

### 8. Create Trigger Handler (for triggers only)
**Location:** `/lib/workflows/triggers/[provider].ts`

```typescript
export async function handleProviderTrigger(
  trigger: any,
  payload: any
): Promise<TriggerResult> {
  // Process webhook payload
  // Match against trigger configuration
  // Return standardized result
}
```

## Action Result Structure

All actions must return this structure:

```typescript
interface ActionResult {
  success: boolean
  output: Record<string, any> // Must match outputSchema
  message: string // For logging
}
```

## Common Patterns

### Pattern 1: Multiple Operations with Error Collection
```typescript
const results = []
const errors = []

for (const item of items) {
  try {
    const result = await processItem(item)
    results.push(result)
  } catch (error) {
    errors.push(`${item}: ${error.message}`)
  }
}

return {
  success: results.length > 0,
  output: {
    processed: results.length,
    failed: errors.length,
    errors: errors
  },
  message: `Processed ${results.length} of ${items.length} items`
}
```

### Pattern 2: Conditional Operations
```typescript
if (makePublic) {
  // Additional operation
}

if (sendNotification) {
  // Send notification
}
```

### Pattern 3: Default Values and Optional Fields
```typescript
const {
  requiredField, // Will error if not provided
  optionalField = 'default', // Has default
  conditionalField // May be undefined
} = resolvedConfig

// Check before using
if (conditionalField) {
  // Use the field
}
```

## Testing Checklist

### UI Testing
- [ ] Node appears in workflow builder
- [ ] All fields render correctly
- [ ] Dynamic dropdowns load options
- [ ] Conditional fields show/hide properly
- [ ] Preview features work (if applicable)
- [ ] Values persist when saving

### Backend Testing
- [ ] Action handler executes without errors
- [ ] All UI fields are used in the action
- [ ] Access token is retrieved successfully
- [ ] API calls work with real data
- [ ] Error handling works for failures
- [ ] Output matches outputSchema

### Integration Testing
- [ ] Workflow with action saves correctly
- [ ] Workflow executes successfully
- [ ] Output is available to next nodes
- [ ] Error states are handled gracefully
- [ ] Logs show correct messages

## Common Issues and Solutions

### Issue: "Unsupported data type" error
**Cause:** Missing field mapping in useDynamicOptions.ts
**Solution:** Add mapping for your action type and field

### Issue: Action not found during execution
**Cause:** Handler not registered in executeNode.ts
**Solution:** Import and add handler to actionHandlers object

### Issue: "No integration found" error
**Cause:** Provider name mismatch or integration not connected
**Solution:** 
1. Verify providerId matches integration provider
2. Check provider mapping in integrationStore.ts
3. Ensure user has connected the integration

### Issue: Fields not saving values
**Cause:** Field name mismatch or validation failure
**Solution:**
1. Ensure field names are consistent everywhere
2. Check required field validation
3. Verify resolveValue is getting the field

### Issue: API authentication fails
**Cause:** Wrong provider name or token issues
**Solution:**
1. Verify provider name in getDecryptedAccessToken
2. Check OAuth scopes match requirements
3. Test token refresh mechanism

## Complete Example: Google Docs Share Document

### 1. Node Definition (availableNodes.ts)
```typescript
{
  type: "google_docs_action_share_document",
  title: "Share Document",
  description: "Share a Google Document with specific users or make it public",
  icon: Share,
  providerId: "google-docs",
  category: "Productivity",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive"],
  configSchema: [
    {
      name: "documentId",
      label: "Document",
      type: "select",
      dynamic: "google-docs-documents",
      required: true
    },
    {
      name: "shareWith",
      label: "Share With",
      type: "text",
      required: false
    },
    // ... more fields
  ]
}
```

### 2. Action Handler (actions/googleDocs.ts)
```typescript
export async function shareGoogleDocument(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const resolvedConfig = resolveValue(config, { input })
  const { documentId, shareWith, permission } = resolvedConfig
  
  const accessToken = await getDecryptedAccessToken(userId, 'google-docs')
  
  // Share logic...
  
  return {
    success: true,
    output: { documentId, sharedWith: emails },
    message: `Document shared with ${emails.length} users`
  }
}
```

### 3. Registration (executeNode.ts)
```typescript
import { shareGoogleDocument } from './actions/googleDocs'

const actionHandlers = {
  "google_docs_action_share_document": shareGoogleDocument,
}
```

### 4. Field Mapping (useDynamicOptions.ts)
```typescript
google_docs_action_share_document: {
  documentId: "google-docs-documents",
}
```

## Best Practices

1. **Always resolve configuration first** - Use resolveValue to handle workflow variables
2. **Provide defaults for optional fields** - Prevents undefined errors
3. **Log errors with context** - Include field values in error messages
4. **Return partial success** - Process what you can, report what failed
5. **Use consistent naming** - Match UI field names to handler variables
6. **Validate before executing** - Check required fields and formats
7. **Handle rate limits** - Implement retry logic for API calls
8. **Clean up resources** - Close connections, clear temp files
9. **Document special behavior** - Comment non-obvious logic
10. **Test with real data** - Ensure it works with actual API responses

## Uniform Structure Requirements

All actions/triggers must follow this structure for consistency:

1. **Imports** - Same order: ActionResult, resolveValue, getDecryptedAccessToken, API clients
2. **Function signature** - Always (config, userId, input) => Promise<ActionResult>
3. **Try-catch wrapper** - Entire function body in try-catch
4. **Resolve config first** - Before any other operations
5. **Destructure fields** - Clear list of what fields are used
6. **Get token** - Before API initialization
7. **Return structure** - Always success/output/message
8. **Error handling** - Log and return standardized error

## Notes

- This guide applies to both actions and triggers
- Triggers may have additional webhook handling requirements
- Some providers may need special authentication handling
- Update this guide when discovering new patterns or requirements
- Always test the complete flow from UI to execution