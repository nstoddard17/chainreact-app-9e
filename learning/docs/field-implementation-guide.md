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

## Connect Button (Link to Previous Node Outputs)

The **Connect Button** allows users to link a field to outputs from previous workflow nodes, enabling dynamic data flow between nodes.

### What is the Connect Button?
The connect button appears as a small button/icon next to text fields that allows users to:
- Select outputs from previous workflow nodes
- Dynamically populate the field with data from earlier steps
- Create data pipelines between workflow actions

### How to Add the Connect Button

**✅ CHECKLIST - Verify ALL items:**
- [ ] Field has `supportsAI: true` property
- [ ] Field type supports connect button (see below)
- [ ] Field is NOT required, OR has appropriate fallback handling
- [ ] Tested: Button appears in UI next to the field
- [ ] Tested: Can select previous node outputs
- [ ] Tested: Selected value displays correctly
- [ ] Tested: Workflow executes with connected value

### Implementation

Add `supportsAI: true` to the field configuration:

```typescript
{
  name: "description",
  label: "Description",
  type: "textarea",
  required: false,
  placeholder: "Enter description",
  supportsAI: true  // ✅ THIS ENABLES THE CONNECT BUTTON
}
```

**For Rich Text Fields (content, message, body, description, text, notes):**

Rich text fields are excluded from connect mode by default to preserve the variable picker functionality (which allows multiple variables + text). To enable the connect button for these fields, use `hasConnectButton: true`:

```typescript
{
  name: "content",
  label: "Content",
  type: "textarea",
  required: false,
  placeholder: "Enter page content",
  hasVariablePicker: true,  // Keep variable picker
  hasConnectButton: true    // ✅ ADD THIS to override default behavior
}
```

**Implementation Details:**
- Location: `components/workflows/configuration/fields/FieldRenderer.tsx`
- Function: `shouldUseConnectMode()`
- Rich text fields (`content`, `message`, `body`, `description`, `text`, `notes`) default to variable picker mode
- Setting `hasConnectButton: true` overrides this and enables connect mode
- This allows the field to switch between text input and dropdown variable selection

### Field Types That Support Connect Button

✅ **Supported Types:**
- `text` - Single-line text input
- `textarea` - Multi-line text input (use `hasConnectButton: true` for rich text fields)
- `email` - Email input fields

❌ **Not Supported:**
- `select` - Dropdown selections
- `boolean` - Checkboxes/toggles
- `date` - Date pickers
- `number` - Numeric inputs (without supportsAI)
- Dynamic fields (already have their own data sources)

### Examples

**✅ CORRECT - Text field with connect button:**
```typescript
{
  name: "subject",
  label: "Subject",
  type: "text",
  required: false,
  placeholder: "Email subject",
  supportsAI: true  // Connect button will appear
}
```

**✅ CORRECT - Regular textarea with connect button:**
```typescript
{
  name: "notes",
  label: "Notes",
  type: "textarea",
  required: false,
  placeholder: "Additional notes",
  supportsAI: true  // Connect button will appear
}
```

**✅ CORRECT - Rich text field with connect button:**
```typescript
{
  name: "content",
  label: "Content",
  type: "textarea",
  required: false,
  placeholder: "Enter page content",
  hasVariablePicker: true,  // Keep variable picker
  hasConnectButton: true    // Override default to enable connect button
}
```

**❌ INCORRECT - Rich text field without hasConnectButton:**
```typescript
{
  name: "content",
  label: "Content",
  type: "textarea",
  required: false,
  placeholder: "Enter content",
  supportsAI: true  // ❌ WON'T WORK - rich text fields need hasConnectButton
}
```

**❌ INCORRECT - Missing supportsAI:**
```typescript
{
  name: "description",
  label: "Description",
  type: "textarea",
  required: false,
  placeholder: "Enter description"
  // ❌ NO CONNECT BUTTON - missing supportsAI: true or hasConnectButton: true
}
```

**❌ INCORRECT - Wrong field type:**
```typescript
{
  name: "priority",
  label: "Priority",
  type: "select",  // ❌ Select fields don't support connect button
  supportsAI: true,  // This won't work
  options: [...]
}
```

### Common Mistakes to Avoid

1. **Forgetting `supportsAI: true`**
   - This is the #1 mistake - the property MUST be present
   - Always check the field definition includes this property

2. **Using wrong field type**
   - Connect button only works with text, textarea, and email types
   - Don't try to add it to select, boolean, or date fields

3. **Making field required**
   - If field is required AND has connect button, ensure proper validation
   - Consider making field optional when using connect button

4. **Not testing the button**
   - Always verify the button appears in the UI
   - Test selecting a previous node's output
   - Verify the workflow executes with connected data

### When to Use Connect Button

**✅ Use connect button when:**
- Field should accept dynamic data from previous steps
- Users need to chain workflow actions together
- Field value depends on earlier computations
- Creating flexible, reusable workflows

**❌ Don't use connect button when:**
- Field requires specific format or validation
- Field is a selection from predefined options (use select/dynamic)
- Field is a date, boolean, or number with specific constraints
- Field is already dynamic (loading from API)

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
- [ ] **Connect button appears (if `supportsAI: true`)**
- [ ] **Connect button allows selecting previous node outputs**
- [ ] **Connected values display and execute correctly**
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