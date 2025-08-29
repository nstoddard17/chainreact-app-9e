# Field Implementation Complete Guide

## Overview
This document provides a comprehensive checklist for implementing or modifying fields in workflow actions and triggers. Following this guide ensures fields work end-to-end from UI to backend.

## Critical Implementation Steps

### 1. Define Field in availableNodes.ts
**Location:** `/lib/workflows/availableNodes.ts`

Add field configuration to the node's `configSchema`:
```typescript
{
  name: "fieldName",
  label: "Field Label",
  type: "select|text|textarea|boolean|date|etc",
  dynamic: "data-type-identifier", // For dynamic fields only
  required: true|false,
  placeholder: "Placeholder text",
  description: "Field description",
  defaultValue: "default", // Optional
  options: [...], // For static select fields
  conditional: { field: "otherField", value: "value" }, // Optional conditional display
  disabled: true|false, // Optional
  rows: 10, // For textarea
  dependsOn: "parentField" // For dependent fields
}
```

### 2. Map Dynamic Fields in useDynamicOptions.ts
**Location:** `/components/workflows/configuration/hooks/useDynamicOptions.ts`

⚠️ **CRITICAL:** This step is often missed and causes "Unsupported data type" errors!

Add field mapping in the appropriate node type section:
```typescript
const fieldMappings = {
  // Find your node type and add the mapping
  your_node_type: {
    fieldName: "data-type-identifier",
  }
}
```

Example for Google Docs:
```typescript
google_docs_action_share_document: {
  documentId: "google-docs-documents",
}
```

### 3. Handle Special Field Behavior in ConfigurationForm.tsx
**Location:** `/components/workflows/configuration/ConfigurationForm.tsx`

For fields requiring special handling (like previews, dependent loading, etc.):
```typescript
// In handleFieldChange function
if (nodeInfo?.type === 'your_node_type') {
  if (fieldName === 'yourField') {
    // Special handling logic
  }
}
```

### 4. Implement Backend Data Handler
**Location varies by provider:**
- Google: `/app/api/integrations/google/data/handlers/`
- Gmail: `/app/api/integrations/gmail/data/handlers/`
- Other: `/app/api/integrations/[provider]/data/`

Create or update handler function:
```typescript
export const getYourDataType: DataHandler = async (integration, options) => {
  // Fetch and return data
  const data = await fetchFromAPI(...)
  return formatDataForDropdown(data)
}
```

### 5. Register Handler in Index
**Location:** `/app/api/integrations/[provider]/data/handlers/index.ts`

Register the handler:
```typescript
export const handlers: Record<string, DataHandler> = {
  'data-type-identifier': getYourDataType,
  // ...other handlers
}
```

### 6. Ensure Routing Works
**Location:** `/app/api/integrations/fetch-user-data/route.ts`

Verify your provider is properly routed:
```typescript
// For Google services
if (integration.provider?.startsWith('google')) {
  if (dataType.startsWith('google-')) {
    // Routes to Google API
  }
}
```

### 7. Handle Integration Provider Mapping
**Location:** `/stores/integrationStore.ts`

For providers that share integrations (like Google services):
```typescript
const providerMapping: Record<string, string> = {
  'google-docs': 'google',
  'google-drive': 'google',
  // Add your mapping if needed
}
```

### 8. Implement Action Handler (Backend Execution)
**Location:** `/lib/workflows/actions/[provider]/[action].ts`

Create the action handler that uses the field value:
```typescript
export async function yourAction(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const resolvedConfig = resolveValue(config, { input })
  const { fieldName } = resolvedConfig
  
  // Use the field value in your action
  // ...
}
```

### 9. Register Action in executeNode.ts
**Location:** `/lib/workflows/executeNode.ts`

Import and register your action:
```typescript
import { yourAction } from './actions/provider/yourAction'

const actionHandlers = {
  "your_node_type": yourAction,
  // ...
}
```

## Field Types and Their Requirements

### Dynamic Select Fields
1. Must have `dynamic: "data-type-identifier"`
2. Must have field mapping in `useDynamicOptions.ts`
3. Must have backend handler returning array of `{value, label}` objects
4. Handler must be registered in provider's handlers index

### Dependent Fields
1. Must have `dependsOn: "parentField"`
2. Parent field changes must trigger child field reload
3. May need special handling in `ConfigurationForm.tsx`
4. Backend handler receives parent value in options

### Conditional Fields
1. Must have `conditional: { field: "controlField", value: "showValue" }`
2. Automatically handled by `shouldHideField` utility
3. No backend requirements

### File Upload Fields
1. Type: `"file"`
2. Backend handler must handle file storage/retrieval
3. May need special UI component (EnhancedFileInput)

### Rich Text Fields
1. May need custom editor component
2. Special handling for variable insertion
3. Backend must handle HTML/markdown content

## Common Issues and Solutions

### "Unsupported data type" Error
**Cause:** Missing field mapping in `useDynamicOptions.ts`
**Solution:** Add mapping for your node type and field

### Dropdown Not Loading
**Cause:** Handler not registered or integration not found
**Solution:** 
1. Check handler is registered in index
2. Verify integration provider mapping
3. Check API routing

### Field Not Showing
**Cause:** Conditional logic or missing field definition
**Solution:**
1. Check conditional field settings
2. Verify field is in configSchema
3. Check shouldHideField logic

### Value Not Persisting
**Cause:** Field name mismatch or validation issues
**Solution:**
1. Ensure field name is consistent everywhere
2. Check field validation rules
3. Verify onChange handler is called

## Testing Checklist

- [ ] Field appears in UI
- [ ] Dynamic dropdowns load options
- [ ] Selected value persists
- [ ] Dependent fields update when parent changes
- [ ] Conditional fields show/hide correctly
- [ ] Preview features work (if applicable)
- [ ] Backend action uses field value correctly
- [ ] Workflow executes successfully with field value
- [ ] Error states handled gracefully

## Example: Complete Google Docs Document Field

1. **availableNodes.ts:**
```typescript
{
  name: "documentId",
  label: "Document",
  type: "select",
  dynamic: "google-docs-documents",
  required: true,
  placeholder: "Select a document from your Google Docs",
  description: "Choose from your Google Docs documents"
}
```

2. **useDynamicOptions.ts:**
```typescript
google_docs_action_share_document: {
  documentId: "google-docs-documents",
}
```

3. **handlers/drive.ts:**
```typescript
export const getGoogleDocsDocuments = async (integration, options) => {
  const docs = await fetchGoogleDocs(integration)
  return docs.map(doc => ({
    value: doc.id,
    label: doc.name
  }))
}
```

4. **handlers/index.ts:**
```typescript
'google-docs-documents': getGoogleDocsDocuments,
```

5. **actions/googleDocs.ts:**
```typescript
const { documentId } = resolvedConfig
// Use documentId in API call
```

## Notes
- Always test the complete flow from UI selection to workflow execution
- Consider edge cases: empty values, invalid selections, API failures
- Document any provider-specific requirements
- Update this guide when discovering new requirements