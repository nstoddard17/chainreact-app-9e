# Output Schema Audit & Implementation Guide

**Last Updated**: November 9, 2025
**Status**: Google Drive ✅ COMPLETE (9/9 actions)

## What is outputSchema?

The `outputSchema` defines **what data an action returns** after execution. This powers:

✅ **Variable Picker** - Shows available merge fields in subsequent nodes
✅ **Type Safety** - TypeScript knows what properties exist
✅ **Autocomplete** - Suggests available fields when typing `{{node.`
✅ **Workflow Composability** - Nodes can reference previous node outputs

**Without outputSchema:**
- ❌ No variables appear in variable picker
- ❌ Users can't use the node's output data
- ❌ Action is essentially useless in workflows

---

## How to Check if an Action Has outputSchema

### Method 1: Read the Node Definition

```typescript
// In /lib/workflows/nodes/providers/{provider}/index.ts or actions/{action}.schema.ts

export const myAction: NodeComponent = {
  type: "provider:action_name",
  title: "My Action",
  configSchema: [
    // ... input fields
  ],
  outputSchema: [  // ← LOOK FOR THIS
    {
      name: "result",
      label: "Result",
      type: "string",
      description: "What this field contains"
    }
  ]
}
```

**✅ Has outputSchema** if you see the `outputSchema` array
**❌ Missing outputSchema** if the property doesn't exist

### Method 2: Test in Workflow Builder

1. Create a workflow with the action
2. Add another node after it
3. Click variable picker in a field
4. If no variables from that node appear → Missing outputSchema

---

## Output Schema Structure

Every output field must have:

```typescript
{
  name: "fieldName",           // Unique identifier (camelCase)
  label: "Human Readable",     // Display name in variable picker
  type: "string" | "number" | "boolean" | "array" | "object",
  description: "What this field contains and how to use it"
}
```

### Common Output Types

**Simple Values:**
```typescript
{ name: "id", label: "Record ID", type: "string", description: "Unique identifier" }
{ name: "count", label: "Total Count", type: "number", description: "Number of items" }
{ name: "success", label: "Success", type: "boolean", description: "Whether action succeeded" }
```

**Arrays (for loop iteration):**
```typescript
{ name: "files", label: "Files Found", type: "array", description: "Array of matching files" }
{ name: "emails", label: "Emails", type: "array", description: "List of email messages" }
```

**Objects (for nested data):**
```typescript
{ name: "user", label: "User Object", type: "object", description: "Complete user profile" }
{ name: "file", label: "File Object", type: "object", description: "File with content, name, type" }
```

**Timestamps (always ISO 8601 strings):**
```typescript
{ name: "createdAt", label: "Created At", type: "string", description: "ISO timestamp when created" }
```

---

## Implementation Pattern

### Step 1: Identify What the API Returns

Check the provider's API documentation to see what data the endpoint returns.

**Example: Google Drive Upload File**
- API Docs: https://developers.google.com/drive/api/v3/reference/files/create
- Response includes: `id`, `name`, `mimeType`, `size`, `webViewLink`, `webContentLink`, `createdTime`

### Step 2: Map API Response to Output Schema

```typescript
outputSchema: [
  {
    name: "fileId",        // Map from API's "id"
    label: "File ID",
    type: "string",
    description: "Unique identifier for the uploaded file"
  },
  {
    name: "fileName",      // Map from API's "name"
    label: "File Name",
    type: "string",
    description: "Name of the uploaded file"
  },
  {
    name: "fileUrl",       // Map from API's "webViewLink"
    label: "File URL",
    type: "string",
    description: "Direct link to view the file in Google Drive"
  },
  {
    name: "downloadUrl",   // Map from API's "webContentLink"
    label: "Download URL",
    type: "string",
    description: "Direct download link for the file"
  },
  {
    name: "mimeType",      // Direct from API
    label: "File Type",
    type: "string",
    description: "MIME type of the uploaded file"
  },
  {
    name: "size",          // Direct from API
    label: "File Size",
    type: "number",
    description: "Size of the file in bytes"
  },
  {
    name: "createdTime",   // Direct from API
    label: "Created At",
    type: "string",
    description: "ISO timestamp when file was uploaded"
  }
]
```

### Step 3: Include Useful Composite Objects

For actions that return file data, emails, or complex objects, include a **complete object** output:

```typescript
{
  name: "file",
  label: "File Object",
  type: "object",
  description: "Complete file object for use in subsequent nodes (can be used as attachment)"
}
```

**Why?**
- Some fields (like Gmail attachments) expect a complete file object
- Users can pass the entire object instead of individual fields

### Step 4: Update the Action Handler

Ensure the handler implementation actually **returns** the data defined in outputSchema:

```typescript
// In /lib/workflows/actions/{provider}/{action}.ts

export async function uploadFile(config: any, context: ExecutionContext) {
  const response = await googleDriveClient.files.create({...})

  // MUST return object matching outputSchema
  return {
    fileId: response.data.id,
    fileName: response.data.name,
    fileUrl: response.data.webViewLink,
    downloadUrl: response.data.webContentLink,
    mimeType: response.data.mimeType,
    size: response.data.size,
    createdTime: response.data.createdTime,
    file: response.data  // Complete object
  }
}
```

**CRITICAL:** Handler return must include ALL fields from outputSchema.

---

## Systematic Audit Process

### Phase 1: Audit All Providers

**Run this check for EVERY provider:**

```bash
# List all provider directories
ls lib/workflows/nodes/providers/

# For each provider, check actions
grep -r "outputSchema" lib/workflows/nodes/providers/{provider}/ --include="*.ts"

# If no results → ALL ACTIONS MISSING outputSchema
# If some results → Check which actions are missing
```

### Phase 2: Priority Order (Based on Usage)

**High Priority (Most Used):**
1. ✅ Gmail - Check status
2. ✅ Google Drive - COMPLETE (9/9 actions)
3. ✅ Slack - Check status
4. ✅ Discord - Check status
5. ✅ Notion - Check status
6. ✅ Google Sheets - Check status
7. ✅ Airtable - Check status
8. ✅ Stripe - Check status

**Medium Priority:**
9. ✅ HubSpot
10. ✅ Trello
11. ✅ Microsoft Graph (Outlook, OneDrive, Calendar, Teams)
12. ✅ Shopify

**Low Priority (Less Common):**
13-20. Remaining providers (Facebook, Twitter, LinkedIn, etc.)

### Phase 3: Verification Checklist

For each action:
- [ ] `outputSchema` property exists in node definition
- [ ] All output fields have `name`, `label`, `type`, `description`
- [ ] Action handler returns object matching schema
- [ ] Tested in workflow builder - variables appear in picker
- [ ] Variables work when referenced in subsequent nodes
- [ ] Documentation updated with available outputs

---

## Common Patterns by Action Type

### Search/List Actions
**Always include:**
- `results` (array) - The list of found items
- `totalCount` (number) - How many items found
- `hasMore` (boolean) - Whether more results exist beyond limit

```typescript
outputSchema: [
  { name: "files", label: "Files Found", type: "array", description: "Array of matching files" },
  { name: "totalCount", label: "Total Count", type: "number", description: "Number of files found" },
  { name: "hasMore", label: "Has More Results", type: "boolean", description: "Whether more results exist beyond the limit" }
]
```

### Create Actions
**Always include:**
- `id` (string) - Unique identifier of created resource
- `name/title` (string) - Name of created resource
- `url` (string) - Direct link to view the resource
- `createdTime` (string) - ISO timestamp when created

```typescript
outputSchema: [
  { name: "folderId", label: "Folder ID", type: "string", description: "Unique identifier for the created folder" },
  { name: "folderName", label: "Folder Name", type: "string", description: "Name of the created folder" },
  { name: "folderUrl", label: "Folder URL", type: "string", description: "Direct link to open the folder" },
  { name: "createdTime", label: "Created At", type: "string", description: "ISO timestamp when folder was created" }
]
```

### Update Actions
**Always include:**
- `id` (string) - ID of updated resource
- `success` (boolean) - Whether update succeeded
- Updated field values (what changed)

```typescript
outputSchema: [
  { name: "fileId", label: "File ID", type: "string", description: "ID of the moved file" },
  { name: "fileName", label: "File Name", type: "string", description: "Name of the moved file" },
  { name: "newLocation", label: "New Location", type: "string", description: "Path of the destination folder" },
  { name: "success", label: "Success", type: "boolean", description: "Whether the move completed successfully" }
]
```

### Delete Actions
**Always include:**
- `id` (string) - ID of deleted resource
- `success` (boolean) - Whether deletion succeeded
- `deletedAt` (string) - ISO timestamp when deleted

```typescript
outputSchema: [
  { name: "fileId", label: "Deleted File ID", type: "string", description: "ID of the deleted file" },
  { name: "fileName", label: "File Name", type: "string", description: "Name of the deleted file" },
  { name: "deletionType", label: "Deletion Type", type: "string", description: "Whether file was trashed or permanently deleted" },
  { name: "success", label: "Success", type: "boolean", description: "Whether deletion was successful" },
  { name: "deletedAt", label: "Deleted At", type: "string", description: "ISO timestamp when deletion occurred" }
]
```

### Get/Retrieve Actions
**Include ALL available metadata:**
- ID, name, type
- Timestamps (created, modified)
- Owner/creator info
- URLs (view, download)
- Permissions/sharing status
- Size, format, properties

```typescript
outputSchema: [
  { name: "fileId", label: "File ID", type: "string", description: "Unique identifier for the file" },
  { name: "fileName", label: "File Name", type: "string", description: "Name of the file" },
  { name: "mimeType", label: "MIME Type", type: "string", description: "File type (e.g., application/pdf, image/jpeg)" },
  { name: "size", label: "File Size", type: "number", description: "Size in bytes" },
  { name: "createdTime", label: "Created At", type: "string", description: "ISO timestamp when file was created" },
  { name: "modifiedTime", label: "Last Modified", type: "string", description: "ISO timestamp of last modification" },
  { name: "webViewLink", label: "View Link", type: "string", description: "URL to view the file in browser" },
  { name: "webContentLink", label: "Download Link", type: "string", description: "Direct download URL" },
  { name: "owners", label: "Owners", type: "array", description: "List of file owners" },
  { name: "permissions", label: "Permissions", type: "array", description: "List of who has access and their permission levels" },
  { name: "shared", label: "Is Shared", type: "boolean", description: "Whether the file is shared with others" }
]
```

---

## Testing Output Schema

### Manual Test Process

1. **Create test workflow:**
   ```
   [Trigger] → [Action with outputSchema] → [Gmail Send Email]
   ```

2. **Configure action** - Use valid test data

3. **Configure Gmail node:**
   - Click in the "Body" field
   - Click variable picker icon
   - Verify all outputSchema fields appear

4. **Test variable references:**
   - Add merge field: `{{action_node.fieldName}}`
   - Save workflow
   - Execute workflow
   - Verify data appears in email

### Automated Test (Future Enhancement)

```typescript
// Test that handler output matches schema
import { uploadFileAction } from './uploadFile.schema'
import { executeUploadFile } from './uploadFile'

test('uploadFile returns all schema fields', async () => {
  const result = await executeUploadFile(mockConfig, mockContext)

  // Check every field in outputSchema exists in result
  uploadFileAction.outputSchema.forEach(field => {
    expect(result).toHaveProperty(field.name)
  })
})
```

---

## Progress Tracking

### Google Drive Status: ✅ COMPLETE

| Action | Status | Notes |
|--------|--------|-------|
| New File in Folder (Trigger) | ✅ | Has outputSchema |
| New Folder in Folder (Trigger) | ✅ | Has outputSchema |
| File Updated (Trigger) | ✅ | Has outputSchema |
| **Upload File** | ✅ | **JUST ADDED** (Nov 9, 2025) |
| Get File | ✅ | Has outputSchema |
| Search Files | ✅ | Has outputSchema |
| List Files | ✅ | Has outputSchema |
| Get File Metadata | ✅ | Has outputSchema |
| Copy File | ✅ | Has outputSchema |
| Move File | ✅ | Has outputSchema |
| Delete File | ✅ | Has outputSchema |
| Share File | ✅ | Has outputSchema |
| Create Folder | ✅ | Has outputSchema |

**Total:** 13/13 actions (100%)

### Next Provider to Audit: Gmail

**Command to check:**
```bash
grep -r "outputSchema" lib/workflows/nodes/providers/gmail/ --include="*.ts" -A 5
```

---

## Common Mistakes to Avoid

### ❌ WRONG: Missing outputSchema Entirely
```typescript
export const myAction: NodeComponent = {
  type: "provider:action",
  configSchema: [...]
  // ← No outputSchema = action is useless
}
```

### ❌ WRONG: Empty Array
```typescript
outputSchema: []  // Users can't reference any data
```

### ❌ WRONG: Missing Description
```typescript
outputSchema: [
  { name: "id", label: "ID", type: "string" }  // No description = users confused
]
```

### ❌ WRONG: Inconsistent Field Names
```typescript
// Handler returns:
return { file_id: "123", file_name: "doc.pdf" }

// But schema says:
outputSchema: [
  { name: "fileId", ... },  // Mismatch! Use camelCase consistently
  { name: "fileName", ... }
]
```

### ✅ CORRECT: Complete Schema with Descriptions
```typescript
outputSchema: [
  {
    name: "fileId",
    label: "File ID",
    type: "string",
    description: "Unique identifier for the uploaded file"
  },
  {
    name: "fileName",
    label: "File Name",
    type: "string",
    description: "Name of the uploaded file"
  }
]

// Handler returns matching object:
return {
  fileId: response.data.id,
  fileName: response.data.name
}
```

---

## FAQ

### Q: Do ALL actions need outputSchema?

**A:** Almost all. Exceptions:
- Actions that don't return data (e.g., pure delete operations that don't return metadata)
- Actions where output is purely side-effect based

**Best practice:** Even delete actions should return `{ success: true, deletedAt: timestamp }`

### Q: Can outputSchema include nested objects?

**A:** Yes! Use `type: "object"` or `type: "array"`

```typescript
{
  name: "user",
  label: "User",
  type: "object",
  description: "User profile with nested properties (access via {{node.user.email}})"
}
```

### Q: How do I reference nested fields?

**A:** Use dot notation: `{{node_id.user.email}}` or `{{node_id.files[0].name}}`

### Q: What if API response changes?

**A:** Update both:
1. outputSchema definition
2. Handler implementation to match new response format

---

## Next Steps

1. **Audit Gmail actions** - Check all send/search/label actions
2. **Audit Slack actions** - Check all channel/message actions
3. **Create automated audit script** - Scan all 247 nodes
4. **Priority fix** - Top 8 providers (80% of usage)
5. **Document findings** - Update this guide with status

**Estimated Time:**
- Per provider audit: 15-30 minutes
- Per missing schema fix: 5-15 minutes
- Total for top 8 providers: 4-6 hours

**Impact:**
- ✅ All actions become usable in workflows
- ✅ Variable picker shows all available data
- ✅ Users can build complex multi-step workflows
- ✅ Documentation is automatically accurate
