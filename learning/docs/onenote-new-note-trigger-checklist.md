# OneNote "New Note Created" Trigger - Implementation Checklist

## Overview
Trigger fires when a new note (page) is created in OneNote. Uses Microsoft Graph webhooks with subscription-based monitoring.

---

## Configuration Fields (User Setup)

### Required Fields
- [x] **Notebook** (dropdown, required)
  - Type: `select`
  - Label: "Notebook"
  - Description: "Select the notebook to monitor for new notes"
  - Data source: `/api/integrations/microsoft/data?dataType=notebooks`
  - Always visible
  - Required: `true`

### Conditional Fields (Hidden Until Parent Selected)
- [ ] **Section** (dropdown, optional)
  - Type: `select`
  - Label: "Section (Optional)"
  - Description: "Optionally filter to a specific section within the notebook"
  - Data source: `/api/integrations/microsoft/data?dataType=sections&notebookId={notebook}`
  - **Hidden until**: `notebook` is selected
  - **Depends on**: `notebook`
  - Required: `false`
  - Allow "All Sections" option

- [ ] **Include Subsections** (checkbox, optional)
  - Type: `checkbox`
  - Label: "Include Subsections"
  - Description: "Monitor all child sections within the selected section"
  - Default: `true`
  - **Hidden until**: `section` is selected
  - **Depends on**: `section`
  - Required: `false`

### Optional Filters
- [ ] **Title Contains** (text input)
  - Type: `text`
  - Label: "Title Contains (Optional)"
  - Description: "Only trigger when note title contains this text"
  - Always visible
  - Required: `false`

---

## Output Fields (Available to Workflow)

### Core Fields
- [ ] `pageId` - Unique ID of the created note
- [ ] `pageTitle` - Title of the note
- [ ] `createdDateTime` - ISO timestamp of creation
- [ ] `lastModifiedDateTime` - ISO timestamp of last edit
- [ ] `pageUrl` - Direct link to note in OneNote
- [ ] `webUrl` - Web link to note

### Content Fields
- [ ] `contentPreview` - First 500 characters of content
- [ ] `content` - Full HTML content of the note
- [ ] `contentType` - Format of content (e.g., "html")

### Metadata Fields
- [ ] `notebookId` - ID of parent notebook
- [ ] `notebookName` - Name of parent notebook
- [ ] `sectionId` - ID of parent section
- [ ] `sectionName` - Name of parent section
- [ ] `createdBy` - Object with user info (id, displayName, email)
- [ ] `lastModifiedBy` - Object with last editor info

### Computed Fields
- [ ] `hasAttachments` - Boolean flag for attachments
- [ ] `level` - Indentation level of the note
- [ ] `order` - Position within section

---

## Implementation Steps

### 1. Node Definition (`/lib/workflows/availableNodes.ts`)
- [ ] Add `microsoftOneNoteNewNote` to triggers section
- [ ] Define Zod schema for config:
  ```typescript
  notebook: z.string().min(1, 'Notebook is required'),
  section: z.string().optional(),
  includeSubsections: z.boolean().optional(),
  titleContains: z.string().optional()
  ```
- [ ] Define output data type with all fields above
- [ ] Set `category: 'trigger'` and `providerId: 'microsoft'`

### 2. Field Mappings (`/components/workflows/configuration/config/fieldMappings.ts`)
- [ ] Add entry for `microsoftOneNoteNewNote`:
  ```typescript
  microsoftOneNoteNewNote: {
    notebook: { type: 'select', label: 'Notebook', required: true },
    section: {
      type: 'select',
      label: 'Section (Optional)',
      required: false,
      dependsOn: 'notebook',
      description: 'Optionally filter to a specific section'
    },
    includeSubsections: {
      type: 'checkbox',
      label: 'Include Subsections',
      dependsOn: 'section',
      description: 'Monitor all child sections'
    },
    titleContains: {
      type: 'text',
      label: 'Title Contains (Optional)',
      required: false
    }
  }
  ```

### 3. Provider Loader (`/components/workflows/configuration/providers/microsoft/`)
- [ ] Create or update Microsoft provider loader
- [ ] Add `notebooks` case to data type switch
- [ ] Add `sections` case with notebook parameter handling
- [ ] Return options in format: `{ label: string, value: string }`

### 4. API Data Handler (`/app/api/integrations/microsoft/data/route.ts`)
- [ ] Add `notebooks` handler:
  - Endpoint: `GET /me/onenote/notebooks`
  - Map to `{ id, displayName }`
- [ ] Add `sections` handler:
  - Endpoint: `GET /me/onenote/notebooks/{notebookId}/sections`
  - Support query param `notebookId`
  - Map to `{ id, displayName, parentNotebook }`
  - Include "All Sections" option when returning

### 5. Trigger Lifecycle (`/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`)
- [ ] Add case for `microsoftOneNoteNewNote` in `onActivate()`
- [ ] Create webhook subscription:
  ```typescript
  resource: `/me/onenote/notebooks/{notebookId}/sections/{sectionId}/pages`
  // or for all sections:
  resource: `/me/onenote/notebooks/{notebookId}/pages`
  changeType: 'created'
  ```
- [ ] Store subscription ID in `trigger_resources` table
- [ ] Add case in `onDeactivate()` to delete subscription
- [ ] Add case in `onDelete()` to clean up resources
- [ ] Add health check to verify subscription is active

### 6. Webhook Handler (`/app/api/webhooks/microsoft/route.ts`)
- [ ] Add handler for `#Microsoft.Graph.onenoteResource` resource type
- [ ] Parse notification data
- [ ] Fetch full page details:
  ```typescript
  GET /me/onenote/pages/{pageId}?$expand=parentNotebook,parentSection
  GET /me/onenote/pages/{pageId}/content (for full content)
  ```
- [ ] Apply filters (section, titleContains, etc.)
- [ ] Transform to output format matching schema
- [ ] Call execution service with transformed data

### 7. Field Dependency Logic (`/components/workflows/configuration/DynamicFieldRenderer.tsx`)
- [ ] Verify `section` field hidden when `notebook` is empty
- [ ] Verify `includeSubsections` hidden when `section` is empty
- [ ] Test parent change handler:
  ```typescript
  // When notebook changes:
  - Clear section value
  - Reset section options
  - Hide includeSubsections
  - Load new section options

  // When section changes:
  - Show/hide includeSubsections
  ```

### 8. Registry Registration (`/lib/triggers/index.ts`)
- [ ] Verify `microsoftGraphTriggerLifecycle` is registered
- [ ] Ensure provider ID matches: `microsoft`
- [ ] Test lookup: `getTriggerLifecycleHandler('microsoft')`

---

## Testing Checklist

### Configuration UI
- [ ] Notebook dropdown loads and displays notebooks
- [ ] Section field hidden initially
- [ ] Section field appears when notebook selected
- [ ] Section dropdown loads sections for selected notebook
- [ ] Include Subsections hidden until section selected
- [ ] Include Subsections appears when section selected
- [ ] Changing notebook clears and reloads section
- [ ] Title Contains field always visible
- [ ] Save button disabled until notebook selected

### Webhook Subscription
- [ ] Subscription created on workflow activation
- [ ] Subscription ID stored in `trigger_resources`
- [ ] Subscription deleted on workflow deactivation
- [ ] Subscription deleted on workflow deletion
- [ ] Health check returns correct status

### Webhook Delivery
- [ ] Create new note → webhook fires
- [ ] Correct workflow triggered
- [ ] All output fields populated correctly
- [ ] Section filter works (if specified)
- [ ] Title filter works (if specified)
- [ ] Subsections respected (if enabled)
- [ ] No duplicate executions

### Edge Cases
- [ ] Works with notebook containing no sections
- [ ] Works with deeply nested section groups
- [ ] Handles notes with no title
- [ ] Handles notes with special characters in title
- [ ] Handles large content (>10KB)
- [ ] Handles rapid note creation (deduplication)

---

## Field Visibility Matrix

| Field | Always Visible | Visible When | Hidden When |
|-------|---------------|--------------|-------------|
| Notebook | ✅ | - | - |
| Section | ❌ | `notebook` is selected | `notebook` is empty |
| Include Subsections | ❌ | `section` is selected | `section` is empty |
| Title Contains | ✅ | - | - |

---

## Data Flow

1. **User selects notebook** → Notebook ID stored
2. **Section field appears** → Loads sections for that notebook
3. **User selects section (optional)** → Section ID stored
4. **Include Subsections appears** → User can toggle
5. **User saves workflow** → Config validated
6. **User activates workflow** → Webhook subscription created
7. **New note created in OneNote** → Microsoft sends webhook
8. **Webhook handler** → Fetches full page data, applies filters
9. **Execution triggered** → Output data available to workflow

---

## Common Issues & Solutions

### Issue: Section dropdown not loading
- **Cause**: Parent `notebook` value not passed to API
- **Fix**: Verify field dependency in fieldMappings includes `dependsOn: 'notebook'`

### Issue: Webhook not firing
- **Cause**: Subscription not created or expired
- **Fix**: Check `trigger_resources` table, verify subscription active in Microsoft Graph

### Issue: Duplicate executions
- **Cause**: Microsoft sends validation + actual notification
- **Fix**: Implement deduplication by `pageId` + `createdDateTime`

### Issue: Content not fetching
- **Cause**: Separate API call needed for content
- **Fix**: Make second call to `/pages/{pageId}/content`

### Issue: Provider ID mismatch
- **Cause**: Node definition uses different providerId than lifecycle handler
- **Fix**: Ensure both use `microsoft` consistently

---

## Required Microsoft Graph Scopes
- `Notes.Read` - Read OneNote notebooks and notes
- `Notes.Read.All` - Read all OneNote notebooks user has access to

---

## Related Documentation
- `/learning/docs/action-trigger-implementation-guide.md`
- `/learning/docs/field-implementation-guide.md`
- `/learning/walkthroughs/microsoft-graph-webhook-duplicate-fix.md`
- Microsoft Graph API: https://learn.microsoft.com/en-us/graph/api/resources/onenote