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

---

## Notes

- This guide applies to both actions and triggers
- Triggers may have additional webhook handling requirements
- Some providers may need special authentication handling
- **This is a living document** - Update when discovering new patterns or requirements
- Last major update: October 2025 (Provider ID Mismatch Troubleshooting)
  - Added troubleshooting section for trigger lifecycle provider registration issues
  - Documented Microsoft provider naming mismatches (teams vs microsoft-teams)
- Previous update: January 2025 (Microsoft Excel implementation)
  - Added Excel actions that replicate Google Sheets functionality
  - Documented pattern for integrations that depend on other integrations (Excel → OneDrive)
  - Added tips for using Microsoft Graph API for Office integrations
- Previous update: January 2025 (Google Drive Get File implementation)
- Always test the complete flow from UI to execution