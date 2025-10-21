# Action/Trigger Complete Implementation Guide

## Overview
This document provides a comprehensive checklist for implementing workflow actions and triggers from UI to backend execution. Following this guide ensures actions/triggers work completely end-to-end and maintain uniform structure across the codebase.

## 🚨 CRITICAL: Trigger Lifecycle Pattern

**MANDATORY FOR ALL TRIGGERS**: If you're implementing a trigger that requires external resources (webhooks, subscriptions, polling), you MUST follow the Trigger Lifecycle Pattern.

### When Does This Apply?
- ✅ **YES** - Triggers that need webhooks (Airtable, Discord, Slack)
- ✅ **YES** - Triggers that need subscriptions (Microsoft Graph, Google APIs)
- ✅ **YES** - Triggers that need external registration of any kind
- ❌ **NO** - Schedule triggers (cron-based, no external resources)
- ❌ **NO** - Manual triggers (user-initiated, no external resources)
- ❌ **NO** - Generic webhook triggers (passive receiver, no registration)

### The Lifecycle Rule
Resources for triggers should ONLY be created when workflows are **activated**, and MUST be cleaned up when workflows are **deactivated** or **deleted**.

```
✅ CORRECT Flow:
1. User connects integration → Save OAuth credentials ONLY
2. User creates workflow → Just configuration (no resources)
3. User ACTIVATES workflow → CREATE webhook/subscription
4. User DEACTIVATES workflow → DELETE webhook/subscription
5. User DELETES workflow → DELETE all resources

❌ WRONG Flow:
1. User connects integration → Creates webhook/subscription immediately
   (This is what we used to do - wastes resources!)
```

### Implementation Steps for Trigger Providers

#### Step 1: Create Lifecycle Implementation
**Location:** `/lib/triggers/providers/[Provider]TriggerLifecycle.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

export class YourProviderTriggerLifecycle implements TriggerLifecycle {

  async onActivate(context: TriggerActivationContext): Promise<void> {
    // 1. Get user's access token
    // 2. Create webhook/subscription in external system
    // 3. Store in trigger_resources table
    // 4. Link to workflow_id
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    // 1. Find resources for this workflow
    // 2. Delete from external system
    // 3. Mark as 'deleted' in trigger_resources table
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    // Usually same as onDeactivate
    return this.onDeactivate(context)
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    // Check if webhook/subscription is still valid
    // Return health status
  }
}
```

**See complete example:** `/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`

#### Step 2: Register Provider
**Location:** `/lib/triggers/index.ts`

```typescript
import { YourProviderTriggerLifecycle } from './providers/YourProviderTriggerLifecycle'

triggerLifecycleManager.registerProvider({
  providerId: 'your-provider',
  lifecycle: new YourProviderTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Your provider webhooks/subscriptions'
})
```

#### Step 3: Database Schema
Resources are automatically tracked in `trigger_resources` table:

```sql
-- Already exists - migration: 20251003_create_trigger_resources_table.sql
-- Tracks: workflow_id, provider_id, trigger_type, external_id, status, expires_at
```

#### Step 4: Test the Lifecycle
1. ❌ Connect integration → NO resources created
2. ❌ Create workflow → NO resources created
3. ✅ Activate workflow → Resources CREATED
4. ✅ Send test → Workflow executes
5. ✅ Deactivate workflow → Resources DELETED
6. ❌ Send test → Workflow does NOT execute
7. ✅ Delete workflow → All cleanup done

### Resources
- **Full Architecture**: `/learning/docs/trigger-lifecycle-audit.md`
- **Migration Guide**: `/learning/walkthroughs/trigger-lifecycle-refactoring.md`
- **Types**: `/lib/triggers/types.ts`
- **Manager**: `/lib/triggers/TriggerLifecycleManager.ts`
- **Database**: `/supabase/migrations/20251003_create_trigger_resources_table.sql`

---

## Critical Implementation Checklist

### 1. Define Node in availableNodes.ts or Provider-Specific Nodes File
**Location:** `/lib/workflows/availableNodes.ts` OR `/lib/workflows/nodes/providers/[provider]/index.ts`

**Note:** As of late 2024, some providers (like Google Drive) have been refactored to use separate node definition files in `/lib/workflows/nodes/providers/`. Check if your provider already has a dedicated file before adding to availableNodes.ts.

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

### 2. Add Output Schema to Registry (CRITICAL for Variable Picker)
**Location:** `/lib/workflows/actions/outputSchemaRegistry.ts`

⚠️ **MANDATORY STEP**: If your action/trigger has an `outputSchema` defined in the node definition, you MUST add it to the output schema registry. Otherwise, **the variable picker won't show the outputs** to users.

**For Actions:**
```typescript
// In OUTPUT_SCHEMA_REGISTRY object
'provider_action_name': [
  { name: 'outputField1', label: 'Output Field 1', type: 'string' },
  { name: 'outputField2', label: 'Output Field 2', type: 'number' },
  // ... match exactly what's in outputSchema from node definition
],
```

**For Triggers:**
```typescript
// In OUTPUT_SCHEMA_REGISTRY object, under "TRIGGERS" section
'provider_trigger_name': [
  { name: 'triggerId', label: 'Trigger ID', type: 'string' },
  { name: 'timestamp', label: 'Timestamp', type: 'string' },
  // ... all fields the trigger provides when it fires
],
```

**For Triggers Without Webhook Implementation Yet:**
```typescript
// Add under "TRIGGERS WITHOUT WEBHOOKS (TODO)" section
'provider_trigger_name': [], // TODO: Implement webhook handler
```

**Why This Matters:**
- The output schema registry is the **single source of truth** for the variable picker
- Without this step, users won't see your action's outputs in the right-side panel
- The hybrid architecture uses this registry to show both static and runtime-discovered fields
- Empty arrays `[]` are fine for triggers awaiting webhook implementation - they signal "coming soon"

**Example - Teams Trigger:**
```typescript
// ✅ CORRECT - Matches node definition outputSchema
'teams_trigger_user_joins_team': [
  { name: 'userId', label: 'User ID', type: 'string' },
  { name: 'userName', label: 'User Name', type: 'string' },
  { name: 'userEmail', label: 'User Email', type: 'string' },
  { name: 'teamId', label: 'Team ID', type: 'string' },
  { name: 'teamName', label: 'Team Name', type: 'string' },
  { name: 'joinTime', label: 'Join Time', type: 'string' },
  { name: 'role', label: 'User Role', type: 'string' }
],

// ❌ WRONG - Missing from registry
// Users won't see any variables in the picker!
```

**Common Mistake:** Defining `outputSchema` in the node definition but forgetting to add it to the registry. This causes the "Why don't I see any variables?" issue.

### 3. Create Action Handler Function
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

### 3. Register Handler in executeNode.ts OR Integration Service
**Location:** `/lib/workflows/executeNode.ts` OR `/lib/services/integrations/[provider]IntegrationService.ts`

**New Architecture (2024+):** Many providers now use integration services that dynamically import action handlers. Check if your provider has an integration service first.

For Integration Service pattern:
```typescript
// In /lib/services/integrations/googleIntegrationService.ts
private async executeGetFile(node: any, context: ExecutionContext) {
  const config = node.data.config || {}
  
  // Import and use actual implementation
  const { getGoogleDriveFile } = await import('@/lib/workflows/actions/googleDrive/getFile')
  return await getGoogleDriveFile(config, context.userId, context.data || {})
}
```

For direct registration pattern:
```typescript
// In /lib/workflows/executeNode.ts
// 1. Import the handler
import { yourActionHandler } from './actions/provider/action'

// 2. Add to actionHandlers object
const actionHandlers: Record<string, ActionHandler> = {
  // ... existing handlers
  "provider_action_name": yourActionHandler,
}
```

### 4. Add Field Mappings for Dynamic Fields
**Location:** `/components/workflows/configuration/config/fieldMappings.ts` (NEW LOCATION as of 2024)

⚠️ **CRITICAL:** Skip this step = "Unsupported data type" errors!

```typescript
// In the provider-specific mappings section
const googleDriveMappings: Record<string, FieldMapping> = {
  "google-drive:get_file": {
    folderId: "google-drive-folders",
    fileId: "google-drive-files",
    fileIdAll: "google-drive-files",
  },
  // ... other mappings
}
```

**Note:** Field mappings have been refactored to a centralized location. Each provider has its own mapping section that gets combined in the export.

### 5. Create Provider Options Loader (NEW PATTERN 2024)
**Location:** `/components/workflows/configuration/providers/[provider]/[Provider]OptionsLoader.ts`

For complex providers with dependent fields, preview functionality, or special loading logic:

```typescript
import { ProviderOptionsLoader } from '../types'

export class GoogleDriveOptionsLoader implements ProviderOptionsLoader {
  async loadOptions(
    fieldName: string,
    providerId: string,
    dependencyFieldName?: string,
    dependencyValue?: any,
    forceRefresh?: boolean
  ): Promise<{ value: string; label: string }[]> {
    // Handle special fields like previews
    if (fieldName === 'filePreview' && dependencyValue) {
      // Special preview logic
    }
    
    // Handle dependent fields
    if (fieldName === 'fileId' && dependencyFieldName === 'folderId') {
      // Load files filtered by folder
    }
    
    // Default loading logic
  }
  
  canHandle(fieldName: string, providerId: string): boolean {
    const supportedFields = ['folderId', 'fileId', 'filePreview']
    return providerId === 'google-drive' && supportedFields.includes(fieldName)
  }
  
  shouldReloadOnDependencyChange(fieldName: string, dependencyFieldName: string): boolean {
    // Define which fields should reload when dependencies change
    return (fieldName === 'fileId' && dependencyFieldName === 'folderId')
  }
}
```

Register in `/components/workflows/configuration/providers/registry.ts`:
```typescript
import { GoogleDriveOptionsLoader } from './google-drive/GoogleDriveOptionsLoader'
// In registerDefaultLoaders():
this.register('google-drive', new GoogleDriveOptionsLoader())
```

### 6. Implement API Data Handlers
**Location:** `/app/api/integrations/[provider]/data/route.ts`

Create API endpoints to fetch dynamic data:

```typescript
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const type = searchParams.get('type')
  
  switch (type) {
    case 'folders':
      // Fetch and return folders
    case 'files':
      // Fetch and return files
  }
}

export async function POST(req: NextRequest) {
  // For operations that need request body (like file preview)
  const { fileId } = await req.json()
  // Fetch and return preview
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

### 🚨 CRITICAL: Error Handling Pattern

**AS OF JANUARY 2025** - All action failures are now properly caught and reported.

#### The Problem (Before Fix)
Some actions would return `{success: false}` instead of throwing errors. The execution engine would treat this as a successful execution and mark the workflow as "success" even though the action failed silently.

#### The Solution (Current Behavior)
The execution engine ([executeNode.ts:519-554](../../lib/workflows/executeNode.ts#L519)) now validates the `ActionResult.success` field:

```typescript
// After handler executes, check if it actually succeeded
if (result.success === false) {
  const errorMessage = result.message || result.error || 'Action failed without error message'
  const error = new Error(errorMessage)

  // Create error log entry
  // Store and log the error

  throw error  // Fails the workflow execution
}
```

#### What This Means for You

**You can use EITHER pattern** - both will properly fail the workflow:

**Pattern 1: Return error result (recommended)**
```typescript
export async function yourAction(config: any, userId: string, input: any): Promise<ActionResult> {
  try {
    // ... action logic

    return {
      success: true,
      output: { /* ... */ },
      message: 'Action completed'
    }
  } catch (error: any) {
    return {
      success: false,  // Engine will catch this and throw
      output: {},
      message: error.message || 'Action failed'
    }
  }
}
```

**Pattern 2: Throw error**
```typescript
export async function yourAction(config: any, userId: string, input: any): Promise<ActionResult> {
  // ... action logic

  if (somethingWrong) {
    throw new Error('Something went wrong')  // Engine catches this
  }

  return {
    success: true,
    output: { /* ... */ },
    message: 'Action completed'
  }
}
```

Both patterns now result in:
- ✅ Workflow execution fails
- ✅ Error is logged properly
- ✅ User sees the failure in the UI
- ✅ No more silent failures

#### Why Both Patterns Work

The execution engine has **4 check points** where `success: false` is detected:
1. Main action handler execution ([executeNode.ts:522](../../lib/workflows/executeNode.ts#L522))
2. Generic action handler ([executeNode.ts:507](../../lib/workflows/executeNode.ts#L507))
3. AI agent/message handlers ([executeNode.ts:413](../../lib/workflows/executeNode.ts#L413))
4. Wait action handler ([executeNode.ts:355](../../lib/workflows/executeNode.ts#L355))

**All** execution paths now validate the result and throw if `success === false`.

#### Best Practice

**Use Pattern 1** (return error result) because:
- ✅ Gives you control over the error message
- ✅ Allows you to include partial output data
- ✅ Can set custom error properties
- ✅ More explicit and readable
- ✅ Easier to test

**Example with rich error data:**
```typescript
catch (error: any) {
  return {
    success: false,
    output: {
      attemptedEmail: email,
      partialResults: processedSoFar  // Useful for debugging
    },
    message: `Failed to send email to ${email}: ${error.message}`,
    error: error.message  // Additional error field for context
  }
}
```

The engine will:
1. Log all this data (including `output` and `error` fields)
2. Create an error log entry with full context
3. Throw with the `message` text
4. Fail the workflow execution

**Date Implemented:** January 21, 2025

## Common Patterns

### Pattern 1: Conditional Field Visibility
Use conditional fields to show/hide fields based on other field values:
```typescript
// Show fileId only when folderId is selected
{
  name: "fileId",
  label: "File",
  type: "select",
  dynamic: "google-drive-files",
  required: true,
  dependsOn: "folderId",
  conditional: { field: "folderId", exists: true }
}

// Show different field when no folder selected
{
  name: "fileIdAll",
  label: "File",
  type: "select",
  dynamic: "google-drive-files",
  required: true,
  conditional: { field: "folderId", exists: false }
}
```

### Pattern 2: File Preview Fields
For read-only preview fields that show content based on selection:
```typescript
{
  name: "filePreview",
  label: "File Preview",
  type: "textarea",
  required: false,
  placeholder: "File preview will appear here...",
  rows: 10,
  disabled: true, // Make it read-only
  dependsOn: "fileId", // Reload when file changes
  conditional: { field: "fileId", exists: true } // Only show when file selected
}
```

### Pattern 3: Multiple Operations with Error Collection
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

### Pattern 4: Conditional Operations
```typescript
if (makePublic) {
  // Additional operation
}

if (sendNotification) {
  // Send notification
}
```

### Pattern 5: Default Values and Optional Fields
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

## Recent Architectural Changes (2024)

### Provider-Specific Node Files
Some providers now use separate node definition files instead of adding everything to availableNodes.ts:
- Google Drive: `/lib/workflows/nodes/providers/google-drive/index.ts`
- Pattern: Export array of node definitions that get imported elsewhere

### Integration Services Pattern
Many providers now route through integration services instead of direct handler registration:
- Location: `/lib/services/integrations/[provider]IntegrationService.ts`
- Benefit: Centralized provider logic, dynamic imports, better organization
- Pattern: Service checks node type and routes to appropriate handler

### Provider Options Loaders
Complex field loading logic has been extracted to provider-specific loaders:
- Location: `/components/workflows/configuration/providers/[provider]/`
- Benefit: Handles dependent fields, previews, special loading logic
- Registration: Add to provider registry in `/components/workflows/configuration/providers/registry.ts`

### Centralized Field Mappings
Field mappings moved from hooks to centralized configuration:
- Old: `/components/workflows/configuration/hooks/useDynamicOptions.ts`
- New: `/components/workflows/configuration/config/fieldMappings.ts`
- Benefit: Better organization, easier to find and update

## Tips and Pitfalls to Avoid

### Common Pitfalls
1. **Forgetting field mappings** - #1 cause of "Unsupported data type" errors
2. **Not registering handlers** - Action executes but does nothing
3. **Provider name mismatches** - Integration shows as disconnected
4. **Missing output schema** - Next nodes can't access the data
5. **Not handling file fields properly** - Files need special storage handling
6. **Forgetting conditional field logic** - Fields show when they shouldn't

### Pro Tips
1. **Check for existing provider files first** - Don't duplicate in availableNodes.ts
2. **Use integration services for Google/Microsoft** - They're already set up
3. **Test with real API data early** - Mock data often differs from reality
4. **Add comprehensive logging** - Helps debug execution issues
5. **Use conditional fields for better UX** - Hide irrelevant fields
6. **Implement preview features** - Users love seeing what they're selecting
7. **Handle partial failures gracefully** - Process what you can, report what failed

### Microsoft Excel / OneDrive Integration Tips
When implementing actions that depend on another integration (like Excel needing OneDrive):
1. **Use `requiredIntegration` field** in node definition to specify dependency
2. **Update `isIntegrationConnected` logic** in CollaborativeWorkflowBuilder to check the required integration
3. **In action handlers**, fetch access token from the required integration (e.g., OneDrive for Excel)
4. **In data API routes**, fetch the required integration instead of looking for a non-existent one
5. **Add provider mappings** for integration connection checking (e.g., 'microsoft-excel' maps to check OneDrive)
6. **Use Microsoft Graph API** for Excel operations - it's accessed through OneDrive's Files.ReadWrite.All scope

### Time Estimates
- **Simple action** (1-3 fields, basic API call): 30-45 minutes
- **Medium action** (4-8 fields, some dependencies): 1-2 hours  
- **Complex action** (previews, conditional fields, multiple operations): 2-4 hours
- **New provider setup** (OAuth, first action): 4-6 hours

## Troubleshooting

### Trigger Resources Not Being Created (Provider ID Mismatch)

**⚠️ CRITICAL: Check this if workflows activate but nothing appears in `trigger_resources` table!**

#### Symptoms
When activating a workflow with a trigger, check the logs for:
```
⚠️ No lifecycle registered for provider: {providerId}
ℹ️ No lifecycle for {providerId}, skipping (no external resources needed)
```

**Result**: No rows created in `trigger_resources` table when workflow activated.

#### Root Cause
The trigger lifecycle manager is registered with a different provider ID than what the workflow node uses.

#### Common Mismatches
| Node Provider ID | Common Mistake | Correct Registration |
|-----------------|----------------|---------------------|
| `microsoft-outlook` | Registered as `microsoft` | Must be `microsoft-outlook` |
| `teams` | Registered as `microsoft-teams` | Must be `teams` (no prefix!) |
| `microsoft-onenote` | Registered as `microsoft` | Must be `microsoft-onenote` |

#### How to Fix
1. **Find the actual provider ID** in `/lib/workflows/nodes/providers/{provider}/index.ts`
   - Look for `providerId: "..."` in the node definition
   - Example: `providerId: "microsoft-outlook"` or `providerId: "teams"`

2. **Check registration** in `/lib/triggers/index.ts`
   - Ensure provider ID matches EXACTLY what's in the node definition
   - Example: If node uses `"teams"`, register as `"teams"` not `"microsoft-teams"`

3. **Update registration** if mismatched
   ```typescript
   // BAD - won't match node with providerId: "microsoft-outlook"
   const microsoftProviders = ['microsoft']

   // GOOD - matches exactly
   const microsoftProviders = ['microsoft-outlook', 'teams', 'microsoft-onenote', 'onedrive']
   ```

4. **Restart dev server** to reload provider registrations

5. **Test**: Deactivate and reactivate workflow, check logs for:
   ```
   ✅ Activated trigger: microsoft-outlook/microsoft-outlook_trigger_new_email for workflow {id}
   ```

#### How to Verify Fix
```sql
-- After activating workflow, check database:
SELECT * FROM trigger_resources WHERE workflow_id = 'your-workflow-id';

-- Should see row with:
-- - provider_id: matching your node's providerId
-- - external_id: ID from external service (e.g., Microsoft Graph subscription ID)
-- - status: 'active'
```

#### Prevention
- **ALWAYS check the node definition** before registering a provider lifecycle
- **Test immediately** after adding a new provider to lifecycle manager
- **Look for warning logs** - they tell you exactly what's wrong
- **Verify all provider variants** - some services have multiple naming patterns (e.g., `google-sheets` vs `google_sheets`)

See `/learning/docs/trigger-lifecycle-audit.md` for complete provider ID reference.

---

## Microsoft Graph Webhook Implementation (Outlook, Teams, OneDrive)

### Critical Lessons from Outlook Trigger Implementation

#### Issue 1: Subscription Configuration - "created,updated" Causes Duplicates

**Problem**: Microsoft Graph sends **both** "created" AND "updated" notifications for the same new email, causing workflows to execute twice.

**Why**: When a new email arrives:
1. Email is created in mailbox → `changeType: "created"` notification sent
2. Email is marked as unread/processed → `changeType: "updated"` notification sent immediately after

**Solution**: Subscribe to ONLY "created" events for new item triggers.

In `MicrosoftGraphTriggerLifecycle.ts`:
```typescript
private getChangeTypeForTrigger(triggerType: string): string {
  // For new/created triggers, only watch 'created' to avoid duplicate notifications
  // Microsoft Graph sends both 'created' and 'updated' for new items, causing duplicates
  if (triggerType.includes('new') || triggerType.includes('created')) {
    return 'created'  // NOT 'created,updated'
  }
  // ... other cases
}
```

**Important**: Even with this fix, you need deduplication logic as a safety net (see Issue 2).

#### Issue 2: Webhook Deduplication Strategy

**Problem**: Microsoft can still send duplicate notifications even when only subscribed to "created".

**Solution**: Implement smart deduplication at the webhook level.

In webhook handler (`/app/api/webhooks/microsoft/route.ts`):
```typescript
// For email notifications, ignore changeType in dedup key
// because Microsoft sends both 'created' and 'updated' for the same message
const isEmailNotification = resource?.includes('/messages') || resource?.includes('/mailFolders')
const dedupKey = isEmailNotification
  ? `${userId}:${messageId}` // Email: ignore changeType
  : `${userId}:${messageId}:${changeType}` // Other: include changeType
```

**Dedup table**: `microsoft_webhook_dedup` with unique constraint on `dedup_key`.

#### Issue 3: Deletions Triggering Workflows

**Problem**: Deleting emails from Outlook triggers the workflow because Microsoft sends `changeType: "created"` notifications when emails are moved to the "Deleted Items" folder (treating it as a "new email" in that folder).

**Root Cause**:
- Microsoft Graph subscriptions to `/me/messages` monitor ALL folders
- When you delete an email, it moves to "Deleted Items"
- Microsoft sends a `changeType: "created"` notification with a NEW message ID for the email in the deleted folder

**Solution**: Respect the folder configuration field. The Outlook trigger has a `folder` field that defaults to Inbox.

In webhook handler (`/app/api/webhooks/microsoft/route.ts`):
```typescript
// Check folder filter - defaults to Inbox if not configured
if (email.parentFolderId) {
  let configFolderId = triggerConfig.folder

  // If no folder configured, default to Inbox
  if (!configFolderId) {
    const foldersResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/mailFolders',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (foldersResponse.ok) {
      const folders = await foldersResponse.json()
      const inboxFolder = folders.value.find((f: any) =>
        f.displayName?.toLowerCase() === 'inbox'
      )
      configFolderId = inboxFolder?.id || null
    }
  }

  // Check if current email is in the configured folder
  if (configFolderId && email.parentFolderId !== configFolderId) {
    console.log('⏭️ Skipping email - not in configured folder:', {
      expectedFolderId: configFolderId,
      actualFolderId: email.parentFolderId,
      subscriptionId: subId
    })
    continue
  }
}
```

**Key Insight**: The folder field in the node config is ALWAYS set (or should default to Inbox). By checking that the email's `parentFolderId` matches the configured folder, deletions are automatically filtered out because deleted emails move to a different folder.

#### Issue 4: Missing Content Filtering

**Problem**: Outlook trigger config has `subject`, `from`, `importance` fields, but they weren't being enforced. ALL new emails triggered the workflow regardless of these filters.

**Root Cause**: Unlike Gmail (which has `fetchTriggerEmail`), Outlook had no filtering logic in the webhook handler.

**Solution**: Fetch the actual email from Microsoft Graph and check filters BEFORE triggering workflow.

```typescript
// For Outlook email triggers, fetch the actual email and check filters
const isOutlookEmailTrigger = resource?.includes('/Messages') || resource?.includes('/messages')
if (isOutlookEmailTrigger && userId && triggerResource.config) {
  try {
    const accessToken = await graphAuth.getValidAccessToken(userId, 'microsoft-outlook')
    const messageId = change?.resourceData?.id

    // Fetch the email
    const emailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const email = await emailResponse.json()

    // Check subject filter
    if (triggerResource.config.subject) {
      const configSubject = triggerResource.config.subject.toLowerCase().trim()
      const emailSubject = (email.subject || '').toLowerCase().trim()

      if (!emailSubject.includes(configSubject)) {
        console.log('⏭️ Skipping email - subject does not match filter')
        continue
      }
    }

    // Check from filter
    if (triggerResource.config.from) {
      const configFrom = triggerResource.config.from.toLowerCase().trim()
      const emailFrom = email.from?.emailAddress?.address?.toLowerCase().trim() || ''

      if (emailFrom !== configFrom) {
        console.log('⏭️ Skipping email - from address does not match filter')
        continue
      }
    }

    // Check importance filter
    if (triggerResource.config.importance && triggerResource.config.importance !== 'any') {
      const configImportance = triggerResource.config.importance.toLowerCase()
      const emailImportance = (email.importance || 'normal').toLowerCase()

      if (emailImportance !== configImportance) {
        console.log('⏭️ Skipping email - importance does not match filter')
        continue
      }
    }

  } catch (filterError) {
    console.error('❌ Error checking email filters (allowing execution):', filterError)
    // Continue to execute even if filter check fails (fail-open for reliability)
  }
}
```

#### Issue 5: UI Button Stuck in Loading State

**Problem**: When activating/deactivating workflow, button gets stuck with lightning animation if activation fails.

**Root Cause**: Frontend was setting `currentWorkflow.status` to the *intended* status instead of the *actual* status returned by the API. When trigger activation failed, API rolled back to "paused" but frontend thought it was "active".

**Solution**: Always use the status returned from the API response.

In `useWorkflowBuilder.ts`:
```typescript
const data = await response.json()

// Check if there was a trigger activation error (API returns 200 but rolls back status)
if (data.triggerActivationError) {
  // Update with the actual status from the response (rolled back to paused)
  setCurrentWorkflow({
    ...currentWorkflow,
    ...data  // Use API data, not our intended newStatus
  })

  toast({
    title: "Activation Failed",
    description: data.triggerActivationError.message,
    variant: "destructive",
  })
  return
}

// Update the local state with the actual status from response
setCurrentWorkflow({
  ...currentWorkflow,
  ...data  // IMPORTANT: Use data from API, not newStatus variable
})

toast({
  title: "Success",
  description: `Workflow ${data.status === 'active' ? 'is now live' : 'has been paused'}`,
  variant: data.status === 'active' ? 'default' : 'secondary',
})
```

**Key lesson**: Never assume the operation succeeded - always use the actual state returned by the server.

#### Issue 6: Account Picker Not Showing

**Problem**: When connecting Microsoft Outlook, it auto-logs in with the Windows/browser account instead of showing account picker.

**Solution**: Change `prompt` parameter from `"consent"` to `"select_account"`.

In OAuth URL generation (`/app/api/integrations/auth/generate-url/route.ts`):
```typescript
const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: config.scope || "",
  prompt: "select_account", // Allow user to choose which account to use
  state,
})
```

**Options**:
- `"consent"` - Forces consent screen but uses current account
- `"select_account"` - Shows account picker (recommended)
- `"login"` - Forces fresh login
- `"none"` - Silent auth (fails if not already logged in)

### Microsoft Graph Webhook Best Practices

1. **Always subscribe to specific changeTypes** - Never use "created,updated,deleted" for new item triggers
2. **Implement deduplication** - Store processed notification IDs to prevent duplicates
3. **Filter at webhook level** - Fetch actual resource and check filters before triggering workflow
4. **Respect folder configuration** - Check email's `parentFolderId` matches configured folder (defaults to Inbox)
5. **Use clientState for security** - Verify webhook authenticity
6. **Implement exponential backoff** - For subscription renewal and API calls
7. **Log extensively** - Microsoft Graph webhooks can be tricky to debug
8. **Fail-open for filters** - If filter check fails, allow execution (reliability > perfection)
9. **Test edge cases**:
   - Deleting items (should NOT trigger if folder filter is set)
   - Moving items between folders
   - Bulk operations
   - Items created by other apps
10. **Check access token scope** - Test `/me` and specific resource endpoints during activation

### Common Microsoft Graph Webhook Gotchas

❌ **Don't**:
- Subscribe to all changeTypes ("created,updated,deleted") for new item triggers
- Assume notification order (they can arrive out of order)
- Trust notification timestamps (use actual resource timestamps)
- Skip deduplication (Microsoft can send duplicates)
- Ignore webhook signature validation
- **Forget to request required OAuth scopes** - Missing scopes cause 403 Forbidden errors

---

## Trigger Deletion UX Pattern

### The Problem
When users delete a trigger node from a workflow, they're left with orphaned action nodes and no way to add a new trigger without deleting everything.

### The Solution: Automatic Trigger Replacement Flow

When a user deletes a trigger, the system automatically prompts them to select a replacement trigger. If they cancel, the original trigger is restored.

#### Implementation Details

**Files Modified:**
1. [useWorkflowBuilder.ts:80](../../hooks/workflows/useWorkflowBuilder.ts#L80) - Added `deletedTriggerBackupRef` to store deleted trigger state
2. [useWorkflowBuilder.ts:2891-2914](../../hooks/workflows/useWorkflowBuilder.ts#L2891) - Modified `confirmDeleteNode` to detect trigger deletion and open trigger selection dialog
3. [useWorkflowBuilder.ts:2206-2235](../../hooks/workflows/useWorkflowBuilder.ts#L2206) - Added `handleTriggerDialogClose` to handle restoration logic
4. [useWorkflowBuilder.ts:3195-3219](../../hooks/workflows/useWorkflowBuilder.ts#L3195) - Modified `handleConfigurationClose` to restore trigger when user cancels config
5. [CollaborativeWorkflowBuilder.tsx:302](../../components/workflows/CollaborativeWorkflowBuilder.tsx#L302) - Connected trigger dialog to restoration handler

**User Flow:**

**Scenario 1: Cancel without selecting new trigger**
1. User deletes trigger → Backup stored
2. Deletion confirmation modal appears → User confirms
3. Trigger deleted → Trigger selection dialog opens automatically
4. User clicks "Cancel" → Original trigger restored ✅

**Scenario 2: Select trigger without configuration**
1. User deletes trigger → Backup stored
2. Trigger selection dialog opens
3. User selects simple trigger (e.g., manual trigger) → Trigger added immediately
4. Backup cleared ✅

**Scenario 3: Select trigger with configuration, then cancel config**
1. User deletes trigger → Backup stored
2. Trigger selection dialog opens
3. User selects trigger that needs config (e.g., Outlook) → Config modal opens
4. Trigger selection dialog closes → Backup preserved (NOT cleared yet)
5. User clicks X on config modal → `handleConfigurationClose` runs → Original trigger restored ✅

**Scenario 4: Select trigger with configuration, then save config**
1. User deletes trigger → Backup stored
2. Trigger selection dialog opens
3. User selects trigger that needs config → Config modal opens
4. User fills config and saves → `handleAddTrigger` runs → New trigger added → Backup cleared ✅

**Key Implementation Points:**

1. **Backup Storage**: Store deleted trigger node + edges in a ref when trigger is deleted
2. **Backup Clearing**: Only clear backup when:
   - User selects a trigger that doesn't need config (added immediately)
   - User successfully saves configuration for new trigger
3. **Restoration Check**: When trigger dialog or config modal closes, check:
   - Does workflow have a trigger now?
   - Is there a pending trigger configuration?
   - If both are false → restore backup

**Code Pattern:**
```typescript
// Store backup on deletion
deletedTriggerBackupRef.current = {
  node: { ...nodeToDelete },
  edges: currentEdges.filter(e => e.source === nodeId || e.target === nodeId)
}

// Restore on cancel
if (!hasNewTrigger && !isPendingTriggerConfig && backup) {
  setNodes((prevNodes) => [...prevNodes, backup.node])
  setEdges((prevEdges) => [...prevEdges, ...backup.edges])
}

// Clear on success
deletedTriggerBackupRef.current = null
```

**Why This Matters:**
- Prevents users from getting stuck with orphaned actions
- Maintains workflow integrity
- Provides clear path forward (replace or keep existing trigger)
- Better UX than forcing manual trigger re-addition

**Related Issue:** Without this fix, users who deleted triggers could only add new triggers by using the "EmptyWorkflowState" component, which only appears when ALL nodes are deleted.
- Create subscriptions during integration connection (use Trigger Lifecycle Pattern)
- Assume `/me/messages` only monitors one folder (it monitors ALL folders including Deleted Items)

✅ **Do**:
- Subscribe to specific changeTypes only ("created" for new items)
- Implement deduplication at webhook level
- Fetch actual resource to verify state and folder
- Check folder filter to prevent deletion triggers
- Check content filters (subject, from, importance) before triggering workflow
- Store subscription metadata in `trigger_resources`
- Clean up subscriptions when workflows are deactivated
- Test with actual Microsoft accounts (dev accounts behave differently)
- Default to Inbox folder if no folder is configured
- **Verify OAuth scopes match resource requirements** - See "Teams Channel Message Subscription 403 Fix" below

### Testing Microsoft Graph Triggers

1. **Test subscription creation**: Check `trigger_resources` table has entries with correct `folder` config
2. **Test new item**: Verify workflow triggers once (not twice)
3. **Test subject filter**: Send email with wrong subject, verify no trigger
4. **Test from filter**: Send from different address, verify no trigger
5. **Test folder filter**:
   - Send email to Inbox → should trigger ✅
   - Send email to different folder → should NOT trigger ❌
6. **Test deletions**:
   - Delete email from configured folder → should NOT trigger ❌
   - Check logs show "⏭️ Skipping email - not in configured folder"
7. **Test deactivation**: Deactivate workflow, verify no more triggers
8. **Test reactivation**: Reactivate, verify fresh subscription works with correct folder
9. **Test bulk operations**: Create/delete multiple items, verify correct behavior and deduplication

### Microsoft Graph Subscription Lifecycle

```
User connects integration:
  ✅ Save OAuth tokens
  ❌ NO subscription created

User creates workflow:
  ✅ Save workflow config
  ❌ NO subscription created

User ACTIVATES workflow:
  ✅ CREATE subscription
  ✅ Store in trigger_resources
  ✅ Link to workflow_id
  ✅ Store clientState for verification

Webhook notification arrives:
  ✅ Verify clientState
  ✅ Check changeType matches config
  ✅ Check deduplication
  ✅ Fetch resource and check filters
  ✅ Trigger workflow if all pass

User DEACTIVATES workflow:
  ✅ DELETE subscription from Microsoft
  ✅ Mark as 'deleted' in trigger_resources

User DELETES workflow:
  ✅ DELETE all subscriptions
  ✅ DELETE from trigger_resources (cascades)
```

### Teams Channel Message Subscription 403 Fix

**Issue**: When activating a Teams "New Message in Channel" trigger, subscription creation fails with:
```
403 Forbidden: Caller does not have access to '/teams/{teamId}/channels/{channelId}/messages'
```

**Root Cause**: The Teams OAuth configuration in [lib/integrations/oauthConfig.ts:352](../../lib/integrations/oauthConfig.ts#L352) was missing the `ChannelMessage.Read.All` scope required to create subscriptions to channel messages.

**Original Scope (Incomplete)**:
```typescript
scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Team.ReadBasic.All https://graph.microsoft.com/Channel.ReadBasic.All"
```

**Fixed Scope (Complete)**:
```typescript
scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Team.ReadBasic.All https://graph.microsoft.com/Team.Create https://graph.microsoft.com/TeamMember.Read.All https://graph.microsoft.com/Channel.ReadBasic.All https://graph.microsoft.com/Channel.Create https://graph.microsoft.com/ChannelMessage.Read.All https://graph.microsoft.com/ChannelMessage.Send https://graph.microsoft.com/Chat.Read https://graph.microsoft.com/Chat.Create https://graph.microsoft.com/ChatMessage.Send"
```

**Required Scopes for Teams Triggers**:
- `ChannelMessage.Read.All` - **CRITICAL for channel message subscriptions**
- `ChannelMessage.Send` - For sending messages to channels
- `Chat.Read` - For reading 1:1 and group chats
- `ChatMessage.Send` - For sending chat messages
- `TeamMember.Read.All` - For reading team membership
- `Team.Create` - For creating teams
- `Channel.Create` - For creating channels

**After Fixing**:
1. ✅ Update the scope in `oauthConfig.ts`
2. ⚠️ **Users MUST reconnect their Teams integration** to get the new scopes
3. ✅ Delete old integration connection from Supabase `integrations` table (forces reconnect)
4. ✅ Go through OAuth flow again to grant new permissions

**How to Prevent**:
1. **Cross-check scopes**: Compare `oauthConfig.ts` scope with `availableIntegrations.ts` scopes array
2. **Test with actual API calls**: Verify token has required permissions before creating subscriptions
3. **Add scope validation**: In `MicrosoftGraphTriggerLifecycle.ts` (lines 63-96), test permissions for each provider
4. **Document required scopes**: Add comments in trigger lifecycle explaining what each scope enables

**Related Files**:
- [lib/integrations/oauthConfig.ts:352](../../lib/integrations/oauthConfig.ts#L352) - OAuth scope configuration
- [lib/integrations/availableIntegrations.ts:112](../../lib/integrations/availableIntegrations.ts#L112) - Declared scopes list
- [lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts:293](../../lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts#L293) - Teams resource mapping
- [lib/triggers/index.ts:24](../../lib/triggers/index.ts#L24) - Provider registration (uses 'teams' not 'microsoft-teams')

**Date**: October 13, 2025

---

## 🎯 Best Practice: Metadata-Driven Webhook Filtering

**Purpose**: Make webhook handlers easily extensible for new triggers without modifying filtering logic.

### The Problem
Hard-coded trigger type checks like `if (triggerType?.includes('email_sent'))` become brittle and unmaintainable as you add more triggers.

### The Solution: Declarative Filter Configuration
**Location:** Top of webhook handler file (e.g., `/app/api/webhooks/microsoft/route.ts`)

```typescript
interface TriggerFilterConfig {
  supportsFolder: boolean;      // Does this trigger support folder filtering?
  supportsSender: boolean;       // Does this trigger filter by sender (from)?
  supportsRecipient: boolean;    // Does this trigger filter by recipient (to)?
  supportsSubject: boolean;      // Does this trigger filter by subject?
  supportsImportance: boolean;   // Does this trigger filter by importance?
  supportsAttachment: boolean;   // Does this trigger filter by attachment?
  defaultFolder?: string;        // Default folder if not specified
}

const TRIGGER_FILTER_CONFIG: Record<string, TriggerFilterConfig> = {
  'microsoft-outlook_trigger_new_email': {
    supportsFolder: true,
    supportsSender: true,
    supportsRecipient: false,
    supportsSubject: true,
    supportsImportance: true,
    supportsAttachment: true,
    defaultFolder: 'inbox'
  },
  'microsoft-outlook_trigger_email_sent': {
    supportsFolder: false,  // Subscription already scoped to Sent Items
    supportsSender: false,
    supportsRecipient: true,
    supportsSubject: true,
    supportsImportance: false,
    supportsAttachment: false,
    defaultFolder: 'sentitems'
  }
  // Add new triggers here - just config, no logic changes!
}
```

### Using the Configuration
```typescript
// Get trigger-specific filter configuration
const filterConfig = TRIGGER_FILTER_CONFIG[triggerType || '']

// Apply filters conditionally based on metadata
if (filterConfig?.supportsFolder && email.parentFolderId) {
  // Only check folder if trigger supports it
}

if (filterConfig?.supportsSender && triggerConfig.from) {
  // Only check sender if trigger supports it
}

if (filterConfig?.supportsRecipient && triggerConfig.to) {
  // Only check recipient if trigger supports it
}
```

### Benefits
1. **Single Source of Truth**: Trigger capabilities defined in one place
2. **Easy Expansion**: Add new triggers by adding config, not modifying logic
3. **Self-Documenting**: Config clearly shows what each trigger supports
4. **Type-Safe**: TypeScript ensures all required fields are present
5. **Maintainable**: No brittle string matching or scattered if statements

### Example: Adding a New Trigger
```typescript
// Step 1: Add to config (NO logic changes needed)
'microsoft-outlook_trigger_email_draft': {
  supportsFolder: false,     // Drafts folder is implicit
  supportsSender: false,     // Drafts don't have senders yet
  supportsRecipient: true,   // Can filter by intended recipient
  supportsSubject: true,     // Can filter by subject
  supportsImportance: false, // Importance not set yet
  supportsAttachment: true,  // Can check for attachments
  defaultFolder: 'drafts'
}

// Step 2: That's it! Filtering logic automatically respects this config
```

### When to Use This Pattern
- ✅ Webhook handlers with multiple trigger types
- ✅ Complex filtering logic that varies by trigger
- ✅ Providers with many triggers (Gmail, Outlook, Slack)
- ✅ When you expect to add more triggers in the future

### Implementation Reference
- **Example Implementation**: `/app/api/webhooks/microsoft/route.ts` (lines 13-62)
- **Used By**: Outlook Email Sent trigger, Outlook New Email trigger

---

## Human-in-the-Loop (HITL) Implementation Pattern

### Overview

Human-in-the-Loop (HITL) is a specialized action that **pauses workflow execution** and initiates a conversational AI interaction with the user. Unlike standard actions that execute and continue, HITL actions:

1. Pause the workflow at a specific node
2. Send a message to the user via Discord/Slack/SMS
3. Enable back-and-forth conversation with AI assistance
4. Extract decisions/modifications from the conversation
5. Resume the workflow with extracted variables

**Use Cases:**
- Email review and approval before sending
- Content review with AI-assisted editing
- Decision checkpoints in automated processes
- Data validation with human oversight
- Policy compliance checks

### Key Features

#### 1. Auto-Context Detection
Automatically formats the previous node's output into readable context:
- Detects data types (strings, numbers, arrays, objects)
- Formats nested objects with proper indentation
- Converts camelCase to Title Case for readability
- Truncates long strings to prevent overflow

**Location:** `/lib/workflows/actions/hitl/index.ts` (lines 17-95)

```typescript
function formatPreviousNodeContext(previousOutput: any): string {
  // Intelligently formats based on data type
  // Handles arrays, objects, primitives
  // Returns human-readable markdown
}
```

#### 2. AI Memory & Learning System
Extracts patterns from conversations and stores them for future use:

**Memory Categories:**
- `tone_preferences` - Communication style (formal vs casual, emoji usage)
- `formatting_rules` - Date formats, capitalization, templates
- `approval_criteria` - What user checks when approving
- `common_corrections` - Frequent changes user makes
- `business_context` - Policies, rules, constraints
- `user_preferences` - Personal habits, defaults

**How It Works:**
1. After conversation completes, GPT-4 analyzes full history
2. Extracts patterns across configured categories
3. Merges with existing learnings (70% existing, 30% new confidence)
4. Saves to user's chosen document (Google Docs, Notion, OneDrive)
5. Optionally caches in Supabase for performance

**Location:** `/lib/workflows/actions/hitl/memoryService.ts`

```typescript
// Extract learnings from conversation
export async function extractLearningsFromConversation(
  conversationHistory: ConversationMessage[],
  contextData: any,
  memoryCategories: string[]
): Promise<Record<string, any>>

// Merge new learnings with existing (smart deduplication)
function mergeLearnings(
  existing: Record<string, any>,
  newLearnings: Record<string, any>
): Record<string, any>

// Save to user's document (primary storage)
export async function saveLearningsToDocument(
  documentInfo: any,
  existingLearnings: Record<string, any>,
  newLearnings: Record<string, any>,
  userId: string
): Promise<boolean>

// Cache in Supabase (optional, for performance)
export async function cacheLearningsInDatabase(
  userId: string,
  workflowId: string,
  conversationId: string,
  learnings: Record<string, any>
): Promise<void>
```

#### 3. Knowledge Base Loading
Load business documents to provide context to AI:
- Company policies
- Brand guidelines
- Compliance documents
- Standard operating procedures

**Supports:** Google Docs, Notion, OneDrive (implementations pending)

#### 4. Continuation Detection
AI automatically detects when user is ready to continue:

**Default Signals:** `continue`, `proceed`, `go ahead`, `send it`, `looks good`, `approve`
**Custom Signals:** Configurable per workflow
**Smart Detection:** Uses OpenAI function calling to reliably detect intent

**Location:** `/lib/workflows/actions/hitl/conversation.ts`

```typescript
// AI calls this function when user wants to proceed
const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'continue_workflow',
      description: 'Call this when the user is ready to continue',
      parameters: {
        type: 'object',
        properties: {
          extractedVariables: { type: 'object' },
          summary: { type: 'string' }
        }
      }
    }

## Duplicate Handling Pattern (HubSpot Contact Example)

### The Problem
When creating records in CRM systems, duplicates are common and expected. A rigid "fail on duplicate" approach causes workflows to fail unnecessarily, requiring manual intervention.

### The Solution: Configurable Duplicate Handling Strategy

Add a configuration option to let users choose how to handle duplicates:
- **Fail with error** (default, backward compatible)
- **Update existing record** (upsert behavior)
- **Skip and return existing** (idempotent behavior)

### Implementation Steps

#### Step 1: Add Configuration to Node Definition
**Location:** `/lib/workflows/nodes/providers/[provider]/index.ts`

```typescript
configSchema: [
  // ... other fields
  {
    name: "duplicateHandling",
    label: "If Contact Already Exists",
    type: "select",
    required: false,
    defaultValue: "fail",
    options: [
      { value: "fail", label: "Fail with error" },
      { value: "update", label: "Update existing contact" },
      { value: "skip", label: "Skip and return existing contact" }
    ],
    description: "How to handle contacts that already exist (matched by email)"
  }
]
```

### Architecture

#### Dual Storage Strategy

**Primary Storage:** User's own documents (user owns and controls data)
- Google Docs
- Notion pages
- OneDrive files

**Optional Cache:** Supabase database (performance optimization)
- Faster access than fetching from external APIs
- Queryable for analytics
- User-controlled via `cacheInDatabase` field (default: true)

**Benefits:**
- Users retain full ownership of their AI memory
- Performance is optimized via optional caching
- Works even if Supabase cache is disabled

#### Database Schema

**Table: `hitl_conversations`**
Tracks active and completed HITL conversations:

```sql
CREATE TABLE hitl_conversations (
  id UUID PRIMARY KEY,
  execution_id UUID REFERENCES workflow_executions(id),
  node_id TEXT NOT NULL,
  workflow_id UUID REFERENCES workflows(id),
  user_id UUID REFERENCES users(id),

  -- Channel configuration
  channel_type TEXT NOT NULL, -- 'discord', 'slack', 'sms'
  channel_id TEXT NOT NULL,
  guild_id TEXT,              -- Discord server ID

  -- Conversation state
  status TEXT NOT NULL,        -- 'active', 'completed', 'timeout', 'cancelled'
  conversation_history JSONB DEFAULT '[]',
  extracted_variables JSONB DEFAULT '{}',
  learnings_extracted JSONB,

  -- Configuration
  system_prompt TEXT,          -- Enhanced with memory + knowledge base
  initial_message TEXT,
  context_data TEXT,
  extract_variables JSONB DEFAULT '{}',
  continuation_signals TEXT[] DEFAULT ARRAY['continue', 'proceed', 'go ahead'],

  -- Timeout handling
  timeout_minutes INTEGER DEFAULT 60,
  timeout_action TEXT DEFAULT 'cancel', -- 'cancel' or 'proceed'
  timeout_at TIMESTAMPTZ,

  -- Memory context
  knowledge_base_used JSONB DEFAULT '[]',
  memory_context_provided TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Table: `hitl_memory`** (optional cache)
Stores extracted learnings for fast access:

```sql
CREATE TABLE hitl_memory (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  workflow_id UUID REFERENCES workflows(id),

  -- Learning data
  scope TEXT NOT NULL,         -- 'workflow', 'global'
  category TEXT NOT NULL,      -- 'tone_preferences', 'formatting_rules', etc.
  learning_summary TEXT,
  learning_data JSONB,

  -- Metadata
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  source_conversation_id UUID REFERENCES hitl_conversations(id),
  usage_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Implementation Files

#### Core Action Handler
**Location:** `/lib/workflows/actions/hitl/index.ts`

Main entry point for HITL action execution:
- Formats context (auto-detect or manual)
- Loads knowledge base documents
- Loads AI memory from user's document
- Builds enhanced system prompt
- Sends initial message via Discord/Slack/SMS
- Creates conversation record
- Pauses workflow execution

**Critical:** Returns `{ pauseExecution: true }` to halt workflow.

#### Conversation Processor
**Location:** `/lib/workflows/actions/hitl/conversation.ts`

Handles AI conversation with OpenAI:
- Generates system prompts with memory context
- Processes user messages
- Detects continuation signals via function calling
- Extracts variables from conversation
- Fallback to keyword detection if OpenAI fails

#### Memory Service
**Location:** `/lib/workflows/actions/hitl/memoryService.ts`

Manages AI memory and learning:
- Extracts learnings using GPT-4
- Merges new patterns with existing (smart deduplication)
- Formats learnings as readable markdown
- Saves to user's document (primary)
- Caches in Supabase (optional)
- Loads from cache for performance

#### Webhook Handler
**Location:** `/app/api/webhooks/discord/hitl/route.ts`

Receives Discord messages and routes to active conversations:
- Finds active conversation for channel
- Processes message through AI
- Detects continuation signals
- Resumes workflow when user approves
- Extracts learnings (non-blocking)
- Updates conversation state

#### Type Definitions
**Location:** `/lib/workflows/actions/hitl/types.ts`

```typescript
export interface HITLConfig {
  // Channel
  channel: 'discord' | 'slack' | 'sms'
  discordGuildId?: string
  discordChannelId?: string

  // Auto-context detection
  autoDetectContext?: boolean
  customMessage?: string

  // Manual mode (legacy)
  initialMessage?: string
  contextData?: string

  // AI configuration
  systemPrompt?: string
  extractVariables?: Record<string, string>

  // Timeout
  timeout?: number
  timeoutAction?: 'cancel' | 'proceed'
  continuationSignals?: string[]

  // Memory & learning
  enableMemory?: boolean
  knowledgeBaseDocuments?: any[]
  memoryStorageDocument?: any
  memoryCategories?: string[]
  cacheInDatabase?: boolean
}
```

#### Discord Integration
**Location:** `/lib/workflows/actions/hitl/discord.ts`

Handles Discord-specific messaging:
- Creates private threads for conversations
- Sends messages to threads
- Manages Discord API authentication
- Handles rate limiting

### Key Patterns

#### Pattern 1: Workflow Pause and Resume

**Pausing:**
```typescript
// In HITL action handler (index.ts)
// Update workflow execution to paused state
await supabase
  .from('workflow_executions')
  .update({
    status: 'paused',
    paused_node_id: context.nodeId,
    paused_at: new Date().toISOString(),
    resume_data: {
      conversation_id: conversation.id,
      hitl_config: config,
      // ... all data needed to resume
    }
  })
  .eq('id', context.executionId)

// Return with pauseExecution flag
return {
  success: true,
  output: { hitlInitiated: true, conversationId },
  pauseExecution: true  // CRITICAL FLAG
}
```

**Resuming:**
```typescript
// In webhook handler (route.ts)
if (shouldContinue) {
  // Extract variables and prepare output
  const outputData = {
    ...resumeData.input,
    hitlStatus: 'continued',
    conversationSummary: summary,
    extractedVariables: extractedVariables || {}
  }

  // Resume workflow
  await supabase
    .from('workflow_executions')
    .update({
      status: 'running',
      paused_node_id: null,
      paused_at: null,
      resume_data: {
        ...resumeData,
        output: outputData
      }
    })
    .eq('id', conversation.execution_id)
}
```

#### Pattern 2: Non-Blocking Learning Extraction

Don't delay workflow for learning extraction:

```typescript
// Process learnings asynchronously (webhook handler)
processConversationLearnings(
  conversation.id,
  conversation.user_id,
  conversation.workflow_id,
  conversationHistory,
  contextData,
  config
).catch(error => {
  // Log but don't fail the workflow
  logger.error('Failed to process learnings (non-blocking)', {
    error: error.message
  })
})

// Workflow continues immediately - learning happens in background
```

#### Pattern 3: Enhanced System Prompt with Memory

Build comprehensive context for AI:

```typescript
function buildSystemPrompt(
  config: HITLConfig,
  aiMemory: any,
  knowledgeBase: string[]
): string {
  let prompt = config.systemPrompt || "You are a helpful workflow assistant..."

  // Add memory context
  if (aiMemory) {
    prompt += '\n\n**AI Memory & Learnings:**\n'
    // Format memory categories
  }

  // Add knowledge base
  if (knowledgeBase.length > 0) {
    prompt += '\n\n**Knowledge Base:**\n'
    knowledgeBase.forEach((content, index) => {
      prompt += `\n**Document ${index + 1}:**\n${content}\n`
    })
  }

  return prompt
}
```

#### Pattern 4: Smart Learning Merging

Avoid duplicates and maintain confidence scores:

```typescript
function mergeLearnings(
  existing: Record<string, any>,
  newLearnings: Record<string, any>
): Record<string, any> {
  const merged = { ...existing }

  for (const [category, newData] of Object.entries(newLearnings)) {
    if (!merged[category]) {
      merged[category] = newData
    } else {
      // Merge patterns (deduplicate with Set)
      const uniquePatterns = Array.from(new Set([
        ...(merged[category].patterns || []),
        ...(newData.patterns || [])
      ]))

      // Keep recent examples (last 10)
      const recentExamples = [
        ...(merged[category].examples || []),
        ...(newData.examples || [])
      ].slice(-10)

      // Weighted confidence (favor established patterns)
      const mergedConfidence =
        (merged[category].confidence * 0.7) +
        (newData.confidence * 0.3)

      merged[category] = {
        patterns: uniquePatterns,
        examples: recentExamples,
        confidence: mergedConfidence,
        lastUpdated: new Date().toISOString(),
        updateCount: (merged[category].updateCount || 0) + 1
      }
    }
  }

  return merged
}
```

### Common Gotchas

#### 1. TypeScript Export Errors

**Problem:** `export 'HITLConfig' (reexported as 'HITLConfig') was not found in './types'`

**Solution:** Use `export type` for type-only exports:

```typescript
// ❌ WRONG
export { HITLConfig } from './types'

// ✅ CORRECT
export type { HITLConfig, ConversationMessage } from './types'
```

#### 2. Missing pauseExecution Flag

**Problem:** HITL action executes but workflow continues immediately.

**Solution:** Always return `pauseExecution: true`:

```typescript
return {
  success: true,
  output: { /* ... */ },
  message: 'Workflow paused',
  pauseExecution: true  // DON'T FORGET THIS!
}
```

#### 3. Document Loading Not Implemented

**Problem:** `loadDocumentContent()` has TODO stubs for all providers.

**Current State:** Google Docs, Notion, OneDrive implementations pending.

**Workaround:** Focus on database caching (`cacheInDatabase: true`) until provider implementations are ready.

#### 4. Memory Not Appearing in Conversations

**Problem:** AI doesn't use memory even when configured.

**Checklist:**
1. Is `enableMemory: true` in config?
2. Is `memoryStorageDocument` configured?
3. Check if memory was loaded: look for `memory_context_provided` in `hitl_conversations`
4. Verify `system_prompt` field contains memory context
5. Check if document content was fetched successfully

#### 5. Continuation Signals Not Detected

**Problem:** User says "continue" but workflow doesn't resume.

**Debugging:**
1. Check OpenAI API key is set (`OPENAI_API_KEY`)
2. Verify `continuationSignals` array in config
3. Check webhook handler logs for function call detection
4. Ensure fallback keyword detection is working
5. Test with exact default signals: `continue`, `proceed`, `go ahead`

### Testing Checklist

#### Backend Testing
- [ ] HITL action pauses workflow execution
- [ ] Conversation record created in `hitl_conversations`
- [ ] Initial message sent via Discord/Slack
- [ ] Workflow execution status is 'paused'
- [ ] `resume_data` contains all necessary context
- [ ] Auto-context detection formats data correctly
- [ ] Manual context mode works with variables

#### AI & Memory Testing
- [ ] Memory loads from user's document (if configured)
- [ ] Knowledge base documents load correctly
- [ ] System prompt includes memory context
- [ ] AI responds appropriately to user messages
- [ ] Continuation signals are detected
- [ ] Variables extracted from conversation
- [ ] Learnings extracted after completion
- [ ] Learnings saved to user's document
- [ ] Learnings cached in database (if enabled)

#### Webhook Integration Testing
- [ ] Webhook receives Discord messages
- [ ] Active conversation found by channel_id
- [ ] User messages added to conversation history
- [ ] AI responses sent back to Discord
- [ ] Workflow resumes when user approves
- [ ] Extracted variables passed to next nodes
- [ ] Conversation marked as completed
- [ ] Timeout handling works (if timeout expires)

#### End-to-End Testing
- [ ] Create workflow with HITL action
- [ ] Execute workflow
- [ ] Verify workflow pauses at HITL node
- [ ] Receive Discord message
- [ ] Have conversation with AI
- [ ] Approve/continue
- [ ] Workflow resumes and completes
- [ ] Check next node receives extracted variables
- [ ] Verify learnings were extracted and saved

### Best Practices

1. **Always use auto-context detection** unless you have specific formatting needs
2. **Enable memory caching** (`cacheInDatabase: true`) for better performance
3. **Provide clear system prompts** that explain the AI's role and what to extract
4. **Define extraction variables** explicitly to get structured data from conversations
5. **Use specific continuation signals** that match your workflow context
6. **Test with real conversations** - AI behavior can be surprising
7. **Handle timeouts gracefully** - decide if timeout should cancel or proceed
8. **Log extensively** - HITL involves many async operations that can fail silently
9. **Don't block on learning extraction** - it can take several seconds with GPT-4
10. **Provide fallback options** - keyword detection if OpenAI fails

### Time Estimates

- **Basic HITL setup** (Discord, no memory): 30-45 minutes
- **With memory & knowledge base**: 1-2 hours
- **Custom channel integration** (Slack/SMS): 2-3 hours
- **Document provider implementation** (Google Docs/Notion/OneDrive): 4-6 hours

### Related Documentation

- **Database Migration**: `/supabase/migrations/*_create_hitl_tables.sql`
- **Discord Integration**: `/lib/workflows/actions/hitl/discord.ts`
- **OpenAI Configuration**: Environment variable `OPENAI_API_KEY` required

**Implementation Date**: January 2025
#### Step 2: Implement Handling in Action
**Location:** `/lib/workflows/actions/[provider].ts`

```typescript
export async function createHubSpotContact(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const duplicateHandling = resolvedConfig.duplicateHandling || 'fail'

    // ... prepare payload

    // Attempt to create
    let response = await fetch(apiUrl, { method: "POST", ... })
    let result: any
    let wasUpdate = false
    let existingContactId: string | null = null

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Check if it's a duplicate (409 Conflict for HubSpot)
      if (response.status === 409 && duplicateHandling !== 'fail') {
        // Extract existing ID from error message
        const match = errorData.message?.match(/Existing ID: (\d+)/)
        existingContactId = match ? match[1] : null

        // Fallback: Search by unique identifier if ID not in error
        if (!existingContactId) {
          existingContactId = await searchByUniqueField(email)
        }

        if (duplicateHandling === 'update' && existingContactId) {
          // PATCH existing resource
          const updateResponse = await fetch(
            `${apiUrl}/${existingContactId}`,
            { method: "PATCH", body: JSON.stringify(payload) }
          )

          if (!updateResponse.ok) {
            throw new Error(`Failed to update existing contact: ${updateResponse.status}`)
          }

          result = await updateResponse.json()
          wasUpdate = true
        } else if (duplicateHandling === 'skip' && existingContactId) {
          // GET existing resource
          const getResponse = await fetch(`${apiUrl}/${existingContactId}`)
          result = getResponse.ok ? await getResponse.json() : { id: existingContactId }
        } else {
          // Still fail if we couldn't resolve the duplicate
          throw new Error(errorData.message || 'Record already exists')
        }
      } else {
        // Non-duplicate error
        throw new Error(errorData.message || response.statusText)
      }
    } else {
      // Success - record was created
      result = await response.json()
    }

    // Build appropriate success message
    let successMessage: string
    if (wasUpdate) {
      successMessage = `Contact updated successfully (${result.properties.email})`
    } else if (existingContactId && duplicateHandling === 'skip') {
      successMessage = `Contact already exists (${result.properties.email}), returning existing contact`
    } else {
      successMessage = `Contact created successfully with email ${result.properties.email}`
    }

    return {
      success: true,
      output: {
        ...result,
        // Include metadata about the operation
        wasUpdate: wasUpdate,
        wasExisting: !!existingContactId,
        duplicateHandling: duplicateHandling
      },
      message: successMessage
    }

  } catch (error: any) {
    // Properly serialize error for logging
    logger.error("Action error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    })

    return {
      success: false,
      output: {},
      message: error.message || "Failed to execute action"
    }
  }
}
```

#### Step 3: Fix Error Logging

**Problem:** JavaScript Error objects don't serialize properly with JSON, resulting in empty objects `{}` in logs.

**Solution:** Explicitly extract error properties:

```typescript
// ❌ BAD - Logs empty object
logger.error("Action error:", error)

// ✅ GOOD - Logs all error details
logger.error("Action error:", {
  message: error.message,
  stack: error.stack,
  name: error.name,
  cause: error.cause
})
```

### API-Specific Implementation Notes

#### HubSpot (409 Conflict)
- Error message includes existing ID: `"Contact already exists. Existing ID: 289098846917"`
- Use regex to extract: `const match = errorData.message?.match(/Existing ID: (\d+)/)`
- Fallback to search API if ID not in message
- Update endpoint: `PATCH /crm/v3/objects/contacts/{id}`

#### Salesforce (DUPLICATE_VALUE)
- Error response has `errorCode: "DUPLICATE_VALUE"`
- Must search by unique field (email, external ID) to find existing record
- Update endpoint: `PATCH /sobjects/Contact/{id}`

#### Other CRMs
- Check API documentation for duplicate error codes
- Most return 409 Conflict or specific error codes
- Update strategy typically uses PATCH with resource ID

### Benefits

1. **User Control** - Let users decide workflow behavior
2. **Backward Compatible** - Default to "fail" preserves existing behavior
3. **Idempotent Workflows** - "Skip" mode makes workflows safe to re-run
4. **Data Sync** - "Update" mode enables keep-in-sync workflows
5. **Better UX** - No manual intervention needed for expected duplicates

### Use Cases

**"Update existing" mode:**
- Sync workflows that run periodically to keep CRM updated
- Import workflows where some records may already exist
- Enrichment workflows that add data to existing contacts

**"Skip and return existing" mode:**
- Idempotent workflows that should succeed if contact exists
- Automation that references contacts but doesn't modify them
- Multi-step workflows where contact creation is a prerequisite

**"Fail with error" mode:**
- Strict data quality requirements
- When duplicates indicate a problem that needs attention
- Workflows where duplicate handling should be explicit

### Testing Checklist

- [ ] Default behavior ("fail") works as before
- [ ] "Update" mode successfully updates existing records
- [ ] "Skip" mode returns existing record without modification
- [ ] Error messages are clear for each mode
- [ ] Logs show proper error details (not empty objects)
- [ ] Output metadata indicates what action was taken (wasUpdate, wasExisting)
- [ ] Works with multiple duplicate detection strategies (error message parsing, search API)

### Related Files
- Node definition: `/lib/workflows/nodes/providers/hubspot/index.ts:675-687`
- Action handler: `/lib/workflows/actions/hubspot.ts:152-285`
- Error logging fix: `/lib/workflows/actions/hubspot.ts:427-434`

**Date Implemented:** October 17, 2025

---

## Notes

- This guide applies to both actions and triggers
- Triggers may have additional webhook handling requirements
- Some providers may need special authentication handling
- **This is a living document** - Update when discovering new patterns or requirements
- Last major update: October 2025 (Metadata-Driven Webhook Filtering)
  - Added declarative filter configuration pattern for scalable webhook handlers
  - Implemented for Outlook Email Sent trigger to support future trigger expansion
  - Refactored Microsoft Graph webhook filtering to be metadata-driven
- Previous update: October 2025 (Provider ID Mismatch Troubleshooting)
  - Added troubleshooting section for trigger lifecycle provider registration issues
  - Documented Microsoft provider naming mismatches (teams vs microsoft-teams)
- Previous update: January 2025 (Microsoft Excel implementation)
  - Added Excel actions that replicate Google Sheets functionality
  - Documented pattern for integrations that depend on other integrations (Excel → OneDrive)
  - Added tips for using Microsoft Graph API for Office integrations
- Previous update: January 2025 (Google Drive Get File implementation)
- Always test the complete flow from UI to execution
