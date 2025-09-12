# Fixing Notion Workspace Names Displaying as IDs

## Problem Description
When users opened the Notion action configuration modal in the workflow builder, the workspace dropdown was showing workspace IDs (UUIDs) instead of human-readable workspace names.

**Example of the issue:**
- Instead of: "ChainReact", "Nathaniel's Workspace"
- Showing as: "0e3687b2-e937-818a-bf02-000340390ee5", "5ed2ec34-3701-8113-9f43-0003aecfdc4a"

## Investigation Process

### 1. Initial Discovery
Used Playwright to navigate through the workflow builder and confirm the issue:
- Created a new workflow with a Manual trigger
- Added a Notion "Get Page Details" action
- Opened the workspace dropdown and confirmed IDs were showing instead of names

### 2. Tracing the Data Flow

#### API Handler Check
First checked the API handler that returns workspace data:
- **File**: `/app/api/integrations/notion/data/handlers/workspaces.ts`
- The handler was correctly returning both `value` (ID) and `label` (name) properties
- However, it was using `workspace.name` to get the workspace name from metadata

#### Component Investigation
Checked the UI components to understand how options are displayed:
- **GenericSelectField** component - properly passes options to Combobox
- **Combobox** component - correctly displays `label` when provided
- **fieldFormatters.ts** - handles formatting of different field types

### 3. Root Cause Discovery

The issue was in the workspace handler's data access pattern:

```typescript
// INCORRECT - workspace.name doesn't exist
const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => ({
  id,
  name: workspace.name,  // This was undefined!
  value: id,
  label: workspace.name,  // This was undefined!
  // ...
}))
```

By examining the OAuth callback code (`/app/api/integrations/notion/callback/route.ts`), discovered that workspace data is stored with different property names:
- `workspace_name` (not `name`)
- `workspace_icon` (not `icon`)
- `workspace_id`
- `owner_type` (not `owner`)

## The Fix

### Step 1: Update Property Access in Workspace Handler

**File**: `/app/api/integrations/notion/data/handlers/workspaces.ts`

```typescript
// BEFORE (incorrect property names)
const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => ({
  id,
  name: workspace.name,
  value: id,
  label: workspace.name,
  icon: workspace.icon,
  owner: workspace.owner,
  object: workspace.object || 'workspace'
}))

// AFTER (correct property names with fallbacks)
const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => ({
  id,
  name: workspace.workspace_name || workspace.name || id,  // Use workspace_name (correct property)
  value: id,
  label: workspace.workspace_name || workspace.name || id,  // Use workspace_name (correct property)
  icon: workspace.workspace_icon || workspace.icon,
  owner: workspace.owner_type || workspace.owner,
  object: workspace.object || 'workspace'
}))
```

### Step 2: Handle Different Metadata Structures

Added support for both nested and flat metadata structures to handle various storage patterns:

```typescript
// Get workspaces from metadata - check different possible structures
let workspaces = notionIntegration.metadata?.workspaces || {}

// If workspaces is empty, check if the metadata itself contains workspace data
if (Object.keys(workspaces).length === 0 && notionIntegration.metadata) {
  // Check if metadata has workspace_id and workspace_name directly
  if (notionIntegration.metadata.workspace_id && notionIntegration.metadata.workspace_name) {
    console.log('📦 Found workspace data directly in metadata')
    workspaces = {
      [notionIntegration.metadata.workspace_id]: {
        workspace_id: notionIntegration.metadata.workspace_id,
        workspace_name: notionIntegration.metadata.workspace_name,
        workspace_icon: notionIntegration.metadata.workspace_icon,
        bot_id: notionIntegration.metadata.bot_id,
        owner_type: notionIntegration.metadata.owner_type,
        user_info: notionIntegration.metadata.user_info
      }
    }
  }
}
```

### Step 3: Add Debug Logging

Added comprehensive logging to help diagnose similar issues in the future:

```typescript
console.log('📦 Full metadata object:', JSON.stringify(notionIntegration.metadata, null, 2))
console.log('📦 Workspaces object to process:', JSON.stringify(workspaces, null, 2))

const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => {
  console.log(`🔍 Processing workspace ${id}:`, JSON.stringify(workspace, null, 2))
  // ... rest of mapping
})
```

## Complete Fixed File

Here's the complete updated workspace handler:

```typescript
/**
 * Notion Workspaces Handler
 */

import { NotionIntegration, NotionWorkspace, NotionDataHandler } from '../types'
import { createAdminClient } from "@/lib/supabase/admin"

export const getNotionWorkspaces: NotionDataHandler<NotionWorkspace> = async (integration: any): Promise<NotionWorkspace[]> => {
  console.log('🔍 Notion workspaces fetcher called - fetching workspaces from metadata')
  
  try {
    // Get the Notion integration - handle both integrationId and userId cases
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError
    
    if (integration.id) {
      // If we have a specific integration ID, use that
      console.log(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      // If we have a user ID, find the Notion integration for that user
      console.log(`🔍 Looking up Notion integration for user: ${integration.userId}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', integration.userId)
        .eq('provider', 'notion')
        .eq('status', 'connected')
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else {
      throw new Error("No integration ID or user ID provided")
    }
    
    if (integrationError || !notionIntegration) {
      console.error('🔍 Integration lookup failed:', integrationError)
      throw new Error("Notion integration not found")
    }
    
    console.log(`🔍 Found integration: ${notionIntegration.id}`)
    console.log('📦 Full metadata object:', JSON.stringify(notionIntegration.metadata, null, 2))
    
    // Get workspaces from metadata - check different possible structures
    let workspaces = notionIntegration.metadata?.workspaces || {}
    
    // If workspaces is empty, check if the metadata itself contains workspace data
    if (Object.keys(workspaces).length === 0 && notionIntegration.metadata) {
      // Check if metadata has workspace_id and workspace_name directly
      if (notionIntegration.metadata.workspace_id && notionIntegration.metadata.workspace_name) {
        console.log('📦 Found workspace data directly in metadata')
        workspaces = {
          [notionIntegration.metadata.workspace_id]: {
            workspace_id: notionIntegration.metadata.workspace_id,
            workspace_name: notionIntegration.metadata.workspace_name,
            workspace_icon: notionIntegration.metadata.workspace_icon,
            bot_id: notionIntegration.metadata.bot_id,
            owner_type: notionIntegration.metadata.owner_type,
            user_info: notionIntegration.metadata.user_info
          }
        }
      }
    }
    
    console.log('📦 Workspaces object to process:', JSON.stringify(workspaces, null, 2))
    
    const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => {
      console.log(`🔍 Processing workspace ${id}:`, JSON.stringify(workspace, null, 2))
      return {
        id,
        name: workspace.workspace_name || workspace.name || id,  // Use workspace_name (correct property)
        value: id,
        label: workspace.workspace_name || workspace.name || id,  // Use workspace_name (correct property)
        icon: workspace.workspace_icon || workspace.icon,
        owner: workspace.owner_type || workspace.owner,
        object: workspace.object || 'workspace'
      }
    })
    
    console.log(`✅ Found ${workspaceArray.length} workspaces in metadata`)
    
    return workspaceArray
    
  } catch (error: any) {
    console.error("Error fetching Notion workspaces:", error)
    throw new Error(error.message || "Error fetching Notion workspaces")
  }
}
```

## Key Lessons Learned

1. **Always verify property names**: The metadata structure may use different property names than expected. Check the actual data being stored in the database.

2. **Use fallbacks**: When accessing nested properties, always provide fallbacks to handle different data structures:
   ```typescript
   workspace.workspace_name || workspace.name || id
   ```

3. **Add debug logging**: Comprehensive logging helps quickly identify data structure issues:
   ```typescript
   console.log('📦 Full metadata object:', JSON.stringify(notionIntegration.metadata, null, 2))
   ```

4. **Check the source**: When data isn't displaying correctly, trace it back to where it's originally saved (in this case, the OAuth callback).

5. **Handle multiple structures**: APIs and data structures evolve. Support both old and new formats where possible.

## Testing the Fix

1. Navigate to the workflow builder
2. Add a Notion action (e.g., "Get Page Details")
3. Open the configuration modal
4. Click on the Workspace dropdown
5. Verify that workspace names are displayed (e.g., "ChainReact", "Nathaniel's Workspace") instead of UUIDs

## Related Files

- `/app/api/integrations/notion/data/handlers/workspaces.ts` - Workspace data handler (FIXED)
- `/app/api/integrations/notion/callback/route.ts` - OAuth callback that saves workspace metadata
- `/components/workflows/configuration/utils/fieldFormatters.ts` - Field formatting utilities
- `/components/workflows/configuration/fields/shared/GenericSelectField.tsx` - Select field component
- `/components/ui/combobox.tsx` - Combobox component that displays the options

## Date Fixed
January 11, 2025