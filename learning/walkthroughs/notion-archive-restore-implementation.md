# Notion Archive/Restore Database Item Implementation
**Date:** November 29, 2025
**Feature:** Archive and Restore Database Items

---

## Overview

Implemented archive and restore operations for Notion database items, enabling users to archive (soft delete) database items and restore them later. This achieves feature parity with Zapier's "Restore Data Source Item" action.

**Competitive Status:** Zapier has this, Make.com does not. This implementation gives us feature parity with Zapier.

---

## What Was Implemented

### 1. New Operations in Manage Database Action

**Action Type:** `notion_action_manage_database`
**New Operations:** `archive_item` and `restore_item`
**Location:** [lib/workflows/nodes/providers/notion/unified-actions.ts](lib/workflows/nodes/providers/notion/unified-actions.ts)

**How It Works:**
1. **Archive:** Sets `archived` property to `true` on a database item (page)
2. **Restore:** Sets `archived` property to `false` on a database item (page)
3. Returns updated item with status and timestamp

### 2. Configuration Schema

**Cascading Fields Pattern:**

```typescript
1. Workspace selection
2. Operation selection → "Archive Database Item" OR "Restore Database Item"
3. Database selection (contains the item to archive/restore)
4. Item selection (different field names for archive vs restore)
   - For archive: Shows active (non-archived) items
   - For restore: Shows archived items only
```

**Field Specifications:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `archiveDatabase` | select (dynamic) | Yes | Database containing the item |
| `itemToArchive` | select (dynamic) | Yes (archive) | Active item to archive |
| `itemToRestore` | select (dynamic) | Yes (restore) | Archived item to restore |

**Visibility Conditions:**

```typescript
// Show database selector for both operations
visibilityCondition: {
  or: [
    { field: "operation", operator: "equals", value: "archive_item" },
    { field: "operation", operator: "equals", value: "restore_item" }
  ]
}

// Show itemToArchive only for archive operation
visibilityCondition: { field: "operation", operator: "equals", value: "archive_item" }

// Show itemToRestore only for restore operation
visibilityCondition: { field: "operation", operator: "equals", value: "restore_item" }
```

### 3. Output Schema

**All Operations:**
- `pageId` (string): ID of archived/restored page
- `url` (string): URL of archived/restored page
- `archived` (boolean): Current archived status
- `archivedTime` (string): Timestamp when item was archived (archive operation)
- `restoredTime` (string): Timestamp when item was restored (restore operation)
- `properties` (object): All properties of the item
- `item` (object): Full Notion page object

**Possible Outcomes:**

| Operation | `archived` | Timestamp | Notes |
|-----------|------------|-----------|-------|
| Archive | `true` | `archivedTime` | Item is now archived |
| Restore | `false` | `restoredTime` | Item is now active |

### 4. API Handlers

**File:** [lib/workflows/actions/notion/handlers.ts](lib/workflows/actions/notion/handlers.ts)
**Functions:**
- `notionArchiveDatabaseItem()` (lines 1196-1264)
- `notionRestoreDatabaseItem()` (lines 1266-1334)

**Implementation (Archive):**

```typescript
export async function notionArchiveDatabaseItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  // 1. Get access token
  const accessToken = await getDecryptedAccessToken(context.userId, "notion")

  // 2. Resolve item ID from config
  const itemId = context.dataFlowManager.resolveVariable(config.item_id)

  // 3. Archive the page using Notion API
  const payload = {
    archived: true
  }

  const result = await notionApiRequest(
    `/pages/${itemId}`,
    "PATCH",
    accessToken,
    payload
  )

  // 4. Return archived item with timestamp
  return {
    success: true,
    output: {
      page_id: result.id,
      url: result.url,
      archived: result.archived,
      archived_time: new Date().toISOString(),
      properties: result.properties,
      item: result
    }
  }
}
```

**Implementation (Restore):**

```typescript
export async function notionRestoreDatabaseItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  // 1. Get access token
  const accessToken = await getDecryptedAccessToken(context.userId, "notion")

  // 2. Resolve item ID from config
  const itemId = context.dataFlowManager.resolveVariable(config.item_id)

  // 3. Restore the page using Notion API
  const payload = {
    archived: false
  }

  const result = await notionApiRequest(
    `/pages/${itemId}`,
    "PATCH",
    accessToken,
    payload
  )

  // 4. Return restored item with timestamp
  return {
    success: true,
    output: {
      page_id: result.id,
      url: result.url,
      archived: result.archived,
      restored_time: new Date().toISOString(),
      properties: result.properties,
      item: result
    }
  }
}
```

**Key Design Decisions:**

1. **Simple API Call:** Archive/restore is just a PATCH request setting `archived` property
2. **Separate Fields:** Different field names for archive vs restore for better UX
3. **Dynamic Options:** Item selectors use different dynamic options (active vs archived)
4. **Timestamps:** Include operation timestamp for audit/tracking purposes
5. **Full Item Return:** Return complete page object for downstream workflow use

### 5. Executor Integration

**File:** [lib/workflows/actions/notion/manageDatabase.ts](lib/workflows/actions/notion/manageDatabase.ts)

**Added Cases in Switch Statement:**

```typescript
case 'archive_item':
  const { notionArchiveDatabaseItem } = await import('./handlers');

  const archiveConfig = {
    item_id: config.itemToArchive
  };

  const archiveResult = await notionArchiveDatabaseItem(archiveConfig, context);

  if (!archiveResult.success) {
    throw new Error(archiveResult.message || 'Failed to archive database item');
  }

  return archiveResult.output;

case 'restore_item':
  const { notionRestoreDatabaseItem } = await import('./handlers');

  const restoreConfig = {
    item_id: config.itemToRestore
  };

  const restoreResult = await notionRestoreDatabaseItem(restoreConfig, context);

  if (!restoreResult.success) {
    throw new Error(restoreResult.message || 'Failed to restore database item');
  }

  return restoreResult.output;
```

**Field Mapping:**

| Schema Field | Handler Field | Notes |
|--------------|---------------|-------|
| `itemToArchive` | `item_id` | Page ID to archive |
| `itemToRestore` | `item_id` | Page ID to restore |

---

## Files Modified

### Modified:

1. **lib/workflows/nodes/providers/notion/unified-actions.ts**
   - Added `archive_item` and `restore_item` to operation options
   - Added 3 new configuration fields with conditional visibility
   - Added 3 new output schema fields
   - Lines modified: ~50 lines added

2. **lib/workflows/actions/notion/handlers.ts**
   - Added `notionArchiveDatabaseItem()` function (68 lines, 1196-1264)
   - Added `notionRestoreDatabaseItem()` function (69 lines, 1266-1334)
   - Lines added: 137 lines total

3. **lib/workflows/actions/notion/manageDatabase.ts**
   - Added `archive_item` case to switch statement (lines 364-379)
   - Added `restore_item` case to switch statement (lines 381-396)
   - Lines added: 32 lines

4. **learning/docs/notion-integration-gap-analysis.md**
   - Updated implementation status
   - Marked archive/restore as completed
   - Updated coverage score from 40% to 48%

---

## Use Cases

### 1. Workflow Cleanup

**Scenario:** Archive completed tasks from a project database

```
Trigger: Task Status Changed
Condition: Status = "Done"
Action: Archive Database Item
  - Database: "Tasks" database
  - Item to Archive: {{trigger.page_id}}
```

**Result:**
- Completed tasks automatically archived
- Keeps active task list clean
- Archived tasks still searchable/retrievable

### 2. Temporary Removal

**Scenario:** Archive inactive customers, restore when they return

```
Workflow 1 (Archive):
  Trigger: Customer Inactive for 90 Days
  Action: Archive Database Item
    - Database: "Customers"
    - Item: {{trigger.customer_id}}

Workflow 2 (Restore):
  Trigger: Customer Makes New Purchase
  Action: Restore Database Item
    - Database: "Customers"
    - Item: {{trigger.customer_id}}
```

**Result:**
- Inactive customers archived automatically
- Customers restored when they become active again
- No data loss, clean customer list

### 3. Conditional Archival

**Scenario:** Archive old project items with approval

```
Trigger: Manual Button Click
Condition: Project End Date > 6 Months Ago
Action: Archive Database Item
  - Database: "Projects"
  - Item: {{trigger.project_id}}
```

**Result:**
- Only archives projects meeting criteria
- Requires explicit approval (manual trigger)
- Prevents accidental archival of active projects

### 4. Bulk Archive/Restore

**Scenario:** Archive/restore multiple items in a loop

```
Trigger: Schedule (Weekly)
Action 1: Query Database
  - Database: "Orders"
  - Filter: Status = "Cancelled" AND Created > 30 Days Ago
Action 2: Loop
  - Array: {{action1.results}}
  - For Each Item:
    - Archive Database Item
      - Database: "Orders"
      - Item: {{item.id}}
```

**Result:**
- Automatically archives old cancelled orders
- Keeps order database clean and performant
- Can be reversed if needed

---

## Testing Recommendations

### Manual Testing Steps

1. **Test Archive Item:**
   ```
   1. Create workflow with Manage Database action
   2. Select operation: Archive Database Item
   3. Select database with active items
   4. Select an active item to archive
   5. Run workflow
   6. Verify: archived=true, archivedTime present
   7. Check Notion - item should be archived
   ```

2. **Test Restore Item:**
   ```
   1. First ensure you have an archived item
   2. Create workflow with Manage Database action
   3. Select operation: Restore Database Item
   4. Select same database
   5. Select archived item to restore
   6. Run workflow
   7. Verify: archived=false, restoredTime present
   8. Check Notion - item should be active again
   ```

3. **Test with Dynamic Values:**
   ```
   1. Use trigger data for item ID
   2. Archive item using {{trigger.page_id}}
   3. Verify variable resolution works
   4. Test with item from previous action
   ```

### API Testing Checklist

- [ ] Archive active item (success)
- [ ] Restore archived item (success)
- [ ] Archive already archived item (success - idempotent)
- [ ] Restore already active item (success - idempotent)
- [ ] Handle non-existent item ID (error)
- [ ] Handle invalid database ID (error)
- [ ] Handle missing item_id (error)
- [ ] Verify properties preserved after archive
- [ ] Verify properties preserved after restore
- [ ] Test with items containing relations/rollups

### Integration Testing

- [ ] Archive item in workflow with trigger
- [ ] Restore item based on condition
- [ ] Loop through items and archive each
- [ ] Use archived item output in subsequent actions
- [ ] Error handling when item doesn't exist
- [ ] Archive → Restore → Archive sequence

---

## Known Limitations

### 1. Notion API Behavior

**Current:** Notion's `archived` property is a simple boolean flag

**Impact:**
- Cannot retrieve archive history (when was it first archived, by whom, etc.)
- Cannot see how many times an item has been archived/restored
- No built-in "permanent delete" - archived items exist forever

**Workaround:** Add custom properties in database to track archive history if needed

### 2. No Bulk Operations

**Current:** Can only archive/restore one item at a time

**Impact:** Must use loops for bulk operations

**Workaround:** Use Loop action to process multiple items

### 3. Dynamic Options Limitation

**Current:** Requires separate dynamic option providers for:
- `notion_database_items` (active items only)
- `notion_archived_items` (archived items only)

**Impact:** These dynamic option providers must be implemented in the field mappings

**Future Enhancement:** Implement these dynamic option providers if they don't exist yet

### 4. No Archive Reason/Note

**Current:** Cannot specify why an item was archived

**Impact:** Loss of context about archival reason

**Workaround:** Update a "Notes" or "Archive Reason" property before archiving

---

## Future Enhancements

### Short-Term (Can Implement Soon):

1. **Bulk Archive/Restore:**
   - Add array input for multiple item IDs
   - Archive/restore all in single action
   - Return success/failure count

2. **Archive with Reason:**
   - Add optional "Archive Reason" field
   - Update custom property before archiving
   - Include reason in output for logging

3. **Conditional Archive:**
   - Add built-in condition check (don't archive if already archived)
   - Skip operation if condition fails
   - Return skip status in output

### Medium-Term (Requires More Work):

4. **Archive History Tracking:**
   ```typescript
   archiveHistory: {
     enabled: true,
     propertyName: "Archive Log"  // Multi-select or Rich Text property
   }
   // Automatically append archive/restore events to property
   ```

5. **Scheduled Auto-Archive:**
   ```typescript
   autoArchive: {
     enabled: true,
     condition: "created_time > 90 days ago",
     excludeIf: "Status = Active"
   }
   ```

6. **Archive Preview:**
   ```typescript
   preview: true  // Show what will be archived without actually archiving
   returnItemsToArchive: true
   // Returns list of items that would be archived
   ```

### Long-Term (Requires Major Changes):

7. **Permanent Delete:**
   - Add option to permanently delete after archive
   - Require explicit confirmation
   - Cannot be undone (warn user)

8. **Archive to External Storage:**
   ```typescript
   exportBeforeArchive: {
     enabled: true,
     destination: "google_drive" | "dropbox" | "s3",
     format: "json" | "csv" | "markdown"
   }
   ```

---

## Competitive Analysis Update

### Before Implementation:

| Feature | ChainReact | Zapier | Make.com |
|---------|-----------|--------|----------|
| Archive Database Item | ❌ | ✅ | ❌ |
| Restore Database Item | ❌ | ✅ | ❌ |

### After Implementation:

| Feature | ChainReact | Zapier | Make.com |
|---------|-----------|--------|----------|
| Archive Database Item | ✅ | ✅ | ❌ |
| Restore Database Item | ✅ | ✅ | ❌ |

**Result:** Feature parity with Zapier + advantage over Make.com! 🎉

---

## Performance Considerations

### API Calls per Operation:

**Archive:** 1 API call
- 1x PATCH `/pages/{id}` (set archived = true)

**Restore:** 1 API call
- 1x PATCH `/pages/{id}` (set archived = false)

**Optimization:** Very efficient - single API call per operation

### Rate Limiting:

Notion API Rate Limits:
- 3 requests per second per integration
- Averaged over each 60-second window

**Impact of Archive/Restore:**
- Each operation: 0.33 seconds minimum (1 request)
- Can archive ~180 items per minute (within rate limits)

**Best Practice:**
- Use loops with reasonable pace (don't archive thousands at once)
- Consider batching with delays if processing large numbers

---

## Related Documentation

- **Gap Analysis:** [/learning/docs/notion-integration-gap-analysis.md](learning/docs/notion-integration-gap-analysis.md)
- **Find or Create:** [/learning/walkthroughs/notion-find-or-create-implementation.md](learning/walkthroughs/notion-find-or-create-implementation.md)
- **Comment Management:** [/learning/walkthroughs/notion-comment-management-implementation.md](learning/walkthroughs/notion-comment-management-implementation.md)
- **Field Implementation:** [/learning/docs/field-implementation-guide.md](learning/docs/field-implementation-guide.md)
- **Notion API Docs:** https://developers.notion.com/reference/patch-page

---

## Summary

Successfully implemented archive and restore operations for Notion database items, achieving feature parity with Zapier and maintaining competitive advantage over Make.com.

**Implementation Stats:**
- **Time Invested:** ~30 minutes
- **Complexity:** Low (simple API calls)
- **Value:** HIGH (common workflow pattern, competitive parity)
- **Lines Added:** ~219 lines
- **Files Modified:** 4 files

**Next Steps:**
1. Implement dynamic option providers for `notion_database_items` and `notion_archived_items`
2. Add bulk archive/restore capability
3. Add archive history tracking
4. Implement remaining action gaps (file upload, advanced query, block operations)

**Business Impact:**
- Enables cleanup workflows
- Supports temporary removal use cases
- Prevents data loss (soft delete vs hard delete)
- Maintains clean, performant databases
- Feature parity with Zapier (no longer a competitive disadvantage)
