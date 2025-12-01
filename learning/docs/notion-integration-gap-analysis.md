# Notion Integration Gap Analysis
**Last Updated:** November 29, 2025

Competitive analysis comparing ChainReact's Notion integration against Zapier and Make.com to identify missing triggers and actions.

---

## ⚠️ CRITICAL CONSTRAINT DISCOVERED

**Notion does NOT support programmatic webhook creation via API.**

Webhooks must be created manually through the Notion integration UI:
1. Navigate to integration settings → Webhooks tab
2. Click "+ Create a subscription"
3. Enter webhook URL
4. Complete one-time verification token exchange
5. Select event types

**Impact:** We cannot auto-create webhooks on workflow activation like MS Teams/Gmail. Users must manually set up webhooks in Notion.

**Revised Strategy:** Hybrid approach
- Keep polling-based triggers for automatic setup
- Add optional "Connect Webhook" instructions for users who want real-time
- Provide UI to show webhook status and verification token
- Document webhook setup process in integration guide

---

## Executive Summary

### Coverage Score
- **Triggers:** 8/8 implemented (100%)
- **Actions:** 19/25+ implemented (76%)
- **Critical Gaps:** File uploads only (all other gaps closed!)

### Priority Recommendations (REVISED)
1. ✅ **COMPLETED:** Comment management (Create/Read comments) - IMPLEMENTED Nov 29, 2025
2. ✅ **COMPLETED:** Find or Create Database Item (upsert pattern) - IMPLEMENTED Nov 29, 2025
3. ✅ **COMPLETED:** Archive/Restore Database Item - IMPLEMENTED Nov 29, 2025
4. ✅ **COMPLETED:** Block Operations (Add, Get, Get Children, Get Page+Children) - IMPLEMENTED Nov 29, 2025
5. ✅ **COMPLETED:** Advanced Query (JSON filters) - IMPLEMENTED Nov 29, 2025
6. ✅ **COMPLETED:** Get Page Property - IMPLEMENTED Nov 29, 2025
7. ✅ **COMPLETED:** Update Database Schema - IMPLEMENTED Nov 29, 2025
8. ✅ **COMPLETED:** Webhook-based Triggers (6 new triggers) - IMPLEMENTED Nov 29, 2025
9. **MEDIUM:** Add file upload capabilities
10. **LOW:** Add webhook setup UI/documentation (manual process)

### Implementation Status Update (Nov 29, 2025)

**Completed:**
- ✅ Comment Management action (`notion_action_manage_comments`)
  - Create comments on pages, blocks, or discussion threads
  - List comments with pagination
  - Full integration with existing Notion handlers
  - Registered in action registry
  - Output schema defined

- ✅ Find or Create Database Item action (`notion_action_manage_database` → `find_or_create_item`)
  - Search database by property value (rich_text properties)
  - Create new item if not found (upsert pattern)
  - Optional search-only mode (createIfNotFound = false)
  - Return found/created status + full item data
  - Competitive advantage (Make.com doesn't have this)
  - Future enhancement: Auto-detect property types beyond rich_text

- ✅ Archive/Restore Database Item actions (`notion_action_manage_database` → `archive_item` / `restore_item`)
  - Archive database items (sets archived = true)
  - Restore archived items (sets archived = false)
  - Returns item status with archived/restored timestamps
  - Feature parity with Zapier

- ✅ Block Management actions (`notion_action_manage_blocks`)
  - Add Block to Page (12 block types supported)
  - Get Block (retrieve single block by ID)
  - Get Block Children (with pagination)
  - Get Page and Children (recursive option)
  - Feature parity with Zapier for all block operations

- ✅ Advanced Database Query action (`notion_action_advanced_query`)
  - JSON filter support (complex AND/OR logic)
  - JSON sorts configuration
  - Pagination support
  - Feature parity with Zapier

- ✅ Get Page Property action (`notion_action_get_page_property`)
  - Retrieve specific property value from any page
  - Supports all property types (title, rich_text, number, select, multi_select, date, checkbox, url, email, phone, people, files)
  - Returns both raw value and formatted string
  - Feature parity with Zapier

- ✅ Update Database Schema action (`notion_action_update_database_schema`)
  - Add new properties to databases
  - Remove properties from databases
  - Supports all property types (19 types)
  - JSON configuration for select/multi-select options
  - Feature parity with Zapier

- ✅ Webhook-based Triggers (6 new triggers)
  - **New Comment** (`notion_trigger_new_comment`)
    - Triggers on comment.created webhook event
    - Filter by all comments, specific database, or specific page
    - Returns comment text, author, parent info, discussion ID
    - Competitive advantage over Make.com (they don't have this)

  - **New Database Item** (`notion_trigger_database_item_created`)
    - Triggers on page.created webhook event (filtered to database items)
    - More specific than generic "New Page in Database"
    - Returns all properties, creation time, creator info
    - Feature parity with Zapier and Make.com

  - **Database Item Updated** (`notion_trigger_database_item_updated`)
    - Triggers on page.updated webhook event (filtered to database items)
    - Filter by update type: any, properties only, or content only
    - Returns changed properties list, content update flag
    - Feature parity with Zapier and Make.com

  - **Page Content Updated** (`notion_trigger_page_content_updated`)
    - Triggers on page.content_updated webhook event
    - Watch specific page or all pages
    - Returns updated blocks information
    - Separates content updates from property updates

  - **Page Properties Updated** (`notion_trigger_page_properties_updated`)
    - Triggers on page.updated webhook event (properties only)
    - Optional: watch specific properties (comma-separated)
    - Returns changed properties with old/new values
    - Granular control over which properties trigger workflows

  - **Database Schema Updated** (`notion_trigger_database_schema_updated`)
    - Triggers on data_source.schema_updated webhook event
    - Watch specific database or all databases
    - Returns added/removed/modified properties
    - UNIQUE competitive advantage (neither Zapier nor Make.com have this!)

---

## 1. TRIGGERS COMPARISON

### ✅ What We Have (8 triggers - 100% COVERAGE!)

| Trigger | Implementation | Type | Notes |
|---------|---------------|------|-------|
| New Page in Database | `notion_trigger_new_page` | Polling | Legacy polling-based trigger |
| Page Updated | `notion_trigger_page_updated` | Polling | Legacy polling-based trigger |
| **New Comment** | `notion_trigger_new_comment` | Webhook | ✅ NEW - comment.created event |
| **New Database Item** | `notion_trigger_database_item_created` | Webhook | ✅ NEW - page.created (filtered) |
| **Database Item Updated** | `notion_trigger_database_item_updated` | Webhook | ✅ NEW - page.updated (filtered) |
| **Page Content Updated** | `notion_trigger_page_content_updated` | Webhook | ✅ NEW - page.content_updated event |
| **Page Properties Updated** | `notion_trigger_page_properties_updated` | Webhook | ✅ NEW - page.updated (properties) |
| **Database Schema Updated** | `notion_trigger_database_schema_updated` | Webhook | ✅ NEW - data_source.schema_updated |

### ✅ All Critical Gaps Closed!

Previously missing triggers are now **ALL IMPLEMENTED**:

| Trigger | ChainReact | Zapier | Make.com | Status |
|---------|-----------|--------|----------|--------|
| **New Comment** | ✅ | ✅ | ❌ | ✅ IMPLEMENTED - Competitive advantage! |
| **Updated Content in Database Item** | ✅ | ✅ | ✅ | ✅ IMPLEMENTED - Feature parity |
| **Updated Content in Page** | ✅ | ✅ | ✅ | ✅ IMPLEMENTED - Feature parity |
| **Updated Properties in Database Item** | ✅ | ✅ | ✅ | ✅ IMPLEMENTED - Feature parity |
| **Database Schema Updated** | ✅ | ❌ | ❌ | ✅ IMPLEMENTED - Unique advantage! |
| **Watch Database Items** | ✅ | ✅ | ✅ | ✅ IMPLEMENTED - Feature parity |

#### Implementation Details

**New Comment** (`notion_trigger_new_comment`):
- Webhook event: `comment.created`
- Filter by all comments, specific database, or specific page
- Returns comment text, author, parent info, discussion ID
- **Competitive advantage:** Make.com doesn't have this!

**Database Item Created/Updated** (`notion_trigger_database_item_created`, `notion_trigger_database_item_updated`):
- Webhook events: `page.created`, `page.updated` (filtered to database items)
- More specific than generic "New Page in Database"
- Filter by update type: any, properties only, or content only
- Returns all properties, changed properties list, creation/update info

**Page Content vs Properties** (`notion_trigger_page_content_updated`, `notion_trigger_page_properties_updated`):
- Separates content updates (blocks) from property updates (metadata)
- Content: Triggers on `page.content_updated` webhook event
- Properties: Triggers on `page.updated` (properties only)
- Granular control: watch specific properties or all properties

**Database Schema Updated** (`notion_trigger_database_schema_updated`):
- Webhook event: `data_source.schema_updated`
- Watch specific database or all databases
- Returns added/removed/modified properties
- **UNIQUE competitive advantage:** Neither Zapier nor Make.com have this!

---

## 2. ACTIONS COMPARISON

### ✅ What We Have (8 unified actions)

| Action Category | Our Implementation | Coverage |
|----------------|-------------------|----------|
| **Page Management** | `notion_action_manage_page` | Good |
| ↳ Create Page | Operation: `create` | ✅ |
| ↳ Update Page | Operation: `update` | ✅ |
| ↳ Append to Page | Operation: `append` | ✅ |
| ↳ Get Page Details | Operation: `get_details` | ✅ |
| ↳ Archive/Unarchive | Operation: `archive` | ✅ |
| ↳ Duplicate Page | Operation: `duplicate` | ✅ |
| **Database Management** | `notion_action_manage_database` | Good |
| ↳ Create Database | Operation: `create` | ✅ |
| ↳ Update Database Info | Operation: `update` → `metadata` | ✅ |
| ↳ Update Database Rows | Operation: `update` → `data` | ✅ |
| **User Management** | `notion_action_manage_users` | Good |
| ↳ List Users | Operation: `list` | ✅ |
| ↳ Get User Details | Operation: `get` | ✅ |
| **Advanced** | Granular actions | Partial |
| ↳ Search Objects | `searchObjects` | ✅ |
| ↳ Make API Call | `makeApiCall` | ✅ |
| ↳ Content Management | 5 granular actions | ✅ |

### ❌ What We're Missing (17+ actions)

#### HIGH Priority Gaps

| Missing Action | Zapier | Make.com | Notion API | Business Impact |
|---------------|--------|----------|-----------|-----------------|
| **Add Comment** | ✅ | ❌ | ✅ API | HIGH - Common use case |
| **Get Page Comments** | ✅ | ❌ | ✅ API | HIGH - Comment workflows |
| **Upload File to Page/Database** | ✅ | ❌ | ✅ API | HIGH - Media workflows |
| **Restore Data Source Item** | ✅ | ❌ | ✅ API | MEDIUM - Archive/restore workflows |
| **Add Block to Page** | ✅ | ✅ | ✅ API | MEDIUM - Granular content control |

#### MEDIUM Priority Gaps

| Missing Action | Zapier | Make.com | Notes |
|---------------|--------|----------|-------|
| **Query Data Source (Advanced)** | ✅ | ❌ | Advanced filtering with JSON, AND/OR logic |
| **Find Page (By Title)** | ✅ | ❌ | Search with specific criteria |
| ~~**Find or Create Database Item**~~ | ✅ | ❌ | ✅ **COMPLETED** - Upsert pattern |
| **Get Block** | ✅ | ❌ | Retrieve specific block by ID |
| **Get Page and Children** | ✅ | ❌ | Retrieve page + all children blocks |
| **Retrieve Block Children** | ✅ | ❌ | Get children as Markdown |
| **Get Page Property** | ✅ | ❌ | Get specific property value |
| **Update Database Schema** | ✅ | ❌ | Add/remove/modify properties |

#### LOW Priority Gaps

| Missing Action | Zapier | Make.com | Notes |
|---------------|--------|----------|-------|
| **Retrieve Database** | ✅ | ❌ | Get database by ID |
| **Update Database (Attributes)** | ✅ | ❌ | Title, parent, icon, archive, lock |
| **Custom Actions (AI Beta)** | ✅ | ❌ | AI-generated custom actions |

---

## 3. DETAILED IMPLEMENTATION RECOMMENDATIONS

### Phase 1: Webhook-Based Triggers (HIGH - 2-3 days)

**Why:** Real-time notifications vs 1-15 minute polling delays

#### 1.1 Convert Existing Triggers to Webhooks
```typescript
// Update these triggers to use webhooks instead of polling
- notion_trigger_new_page → Use webhook for page.created
- notion_trigger_page_updated → Split into two webhook-based triggers
```

#### 1.2 Add New Webhook Triggers
```typescript
{
  type: "notion_trigger_database_item_created",
  title: "New Database Item",
  description: "Triggers when a new item is added to a database (webhook-based)",
  // Webhook event: page.created filtered by database
}

{
  type: "notion_trigger_database_item_updated",
  title: "Database Item Updated",
  description: "Triggers when a database item's properties change (webhook-based)",
  // Webhook event: page.updated (properties only)
}

{
  type: "notion_trigger_page_content_updated",
  title: "Page Content Updated",
  description: "Triggers when page content/blocks are edited (webhook-based)",
  // Webhook event: page.content_updated
  // Note: Aggregated - won't fire for every keystroke
}

{
  type: "notion_trigger_comment_created",
  title: "New Comment",
  description: "Triggers when a comment is added to a page or database",
  // Webhook event: comment.created
  // Requires: comment read capability
  configSchema: [
    { name: "filterType", type: "select", options: [
      { value: "all", label: "All Comments" },
      { value: "database", label: "Specific Database" },
      { value: "page", label: "Specific Page" }
    ]},
    { name: "database", type: "select", dynamic: "notion_databases",
      visibilityCondition: { field: "filterType", operator: "equals", value: "database" }
    },
    { name: "page", type: "select", dynamic: "notion_pages",
      visibilityCondition: { field: "filterType", operator: "equals", value: "page" }
    }
  ]
}

{
  type: "notion_trigger_schema_updated",
  title: "Database Schema Updated",
  description: "Triggers when database properties are added, removed, or modified",
  // Webhook event: data_source.schema_updated (2025-09-03 API)
}
```

#### 1.3 Webhook Infrastructure
**Files to Create/Update:**
- `/lib/triggers/notion/webhook-lifecycle.ts` - Webhook subscription management
- `/app/api/webhooks/notion/route.ts` - Webhook receiver endpoint
- `/lib/triggers/notion/webhook-validator.ts` - Verify webhook signatures

**Database Schema:**
```sql
-- Store webhook subscriptions in webhook_configs table
-- Fields needed: integration_id, event_type, page_id/database_id filters
```

**Reference Implementation:**
- Follow pattern from MS Teams webhook implementation
- See webhook lifecycle documentation

---

### Phase 2: Comment Management (HIGH - 1 day)

#### 2.1 Add Comment Actions
```typescript
// Add to notion_action_manage_page operations
{
  operation: "add_comment",
  label: "Add Comment",
  fields: [
    { name: "page", label: "Page", type: "select", dynamic: "notion_pages" },
    { name: "comment", label: "Comment Text", type: "textarea" },
    { name: "discussionId", label: "Reply to Discussion (Optional)", type: "text" }
  ]
}

// New action for comment retrieval
{
  type: "notion_action_get_comments",
  title: "Get Page Comments",
  description: "Retrieve all comments from a page or discussion thread",
  configSchema: [
    { name: "page", label: "Page", type: "select", dynamic: "notion_pages" },
    { name: "discussionId", label: "Specific Discussion (Optional)", type: "text" }
  ],
  outputSchema: [
    { name: "comments", label: "Comments", type: "array" },
    { name: "hasMore", label: "Has More", type: "boolean" }
  ]
}
```

**API Endpoints:**
- POST `/v1/comments` - Create comment
- GET `/v1/comments?block_id={id}` - Retrieve comments

---

### Phase 3: Archive/Restore & File Management (HIGH - 2 days)

#### 3.1 Enhance Archive Actions
```typescript
// Already have archive in notion_action_manage_page
// Add restore for database items

{
  type: "notion_action_restore_database_item",
  title: "Restore Database Item",
  description: "Restore an archived database item",
  configSchema: [
    { name: "database", label: "Database", type: "select" },
    { name: "item", label: "Archived Item", type: "select",
      dynamic: "notion_archived_items", // New dynamic option
      dependsOn: "database"
    }
  ]
}
```

#### 3.2 File Upload Actions
```typescript
{
  type: "notion_action_upload_file",
  title: "Upload File",
  description: "Upload a file to a page or database property",
  configSchema: [
    { name: "target", label: "Upload To", type: "select", options: [
      { value: "page_block", label: "Page Block" },
      { value: "database_property", label: "Database File Property" }
    ]},
    { name: "page", label: "Page", type: "select", dynamic: "notion_pages",
      visibilityCondition: { field: "target", operator: "equals", value: "page_block" }
    },
    { name: "database", label: "Database", type: "select", dynamic: "notion_databases",
      visibilityCondition: { field: "target", operator: "equals", value: "database_property" }
    },
    { name: "property", label: "File Property", type: "select", dynamic: "notion_file_properties",
      dependsOn: "database",
      visibilityCondition: { field: "target", operator: "equals", value: "database_property" }
    },
    { name: "file", label: "File", type: "file", required: true,
      accept: "*/*", maxSize: 50 * 1024 * 1024 // 50MB
    },
    { name: "caption", label: "Caption (Optional)", type: "text" }
  ]
}
```

**Implementation Notes:**
- Files must be uploaded to external hosting first (S3, Cloudinary, etc.)
- Notion API only accepts external URLs, not direct file uploads
- Need to implement temporary file hosting or require user to provide URLs

---

### Phase 4: Advanced Search & Query (MEDIUM - 2 days)

#### 4.1 Advanced Query Action
```typescript
{
  type: "notion_action_advanced_query",
  title: "Advanced Database Query",
  description: "Query a database with complex filters, sorting, and pagination using JSON",
  configSchema: [
    { name: "database", label: "Database", type: "select", dynamic: "notion_databases" },
    { name: "filterMode", label: "Filter Mode", type: "select", options: [
      { value: "simple", label: "Simple (Form)" },
      { value: "advanced", label: "Advanced (JSON)" }
    ]},
    // Simple mode
    { name: "simpleFilters", label: "Filters", type: "dynamic_filters",
      dynamic: "notion_database_properties",
      dependsOn: "database",
      visibilityCondition: { field: "filterMode", operator: "equals", value: "simple" }
    },
    // Advanced mode
    { name: "filterJson", label: "Filter JSON", type: "code", language: "json",
      placeholder: '{\n  "and": [\n    { "property": "Status", "status": { "equals": "Done" }}\n  ]\n}',
      visibilityCondition: { field: "filterMode", operator: "equals", value: "advanced" }
    },
    { name: "sorts", label: "Sort By", type: "array", fields: [
      { name: "property", label: "Property", type: "select", dynamic: "notion_database_properties" },
      { name: "direction", label: "Direction", type: "select", options: [
        { value: "ascending", label: "Ascending" },
        { value: "descending", label: "Descending" }
      ]}
    ]},
    { name: "pageSize", label: "Results Per Page", type: "number",
      defaultValue: 100, min: 1, max: 100
    }
  ],
  outputSchema: [
    { name: "results", label: "Results", type: "array" },
    { name: "hasMore", label: "Has More Pages", type: "boolean" },
    { name: "nextCursor", label: "Next Cursor", type: "string" }
  ]
}
```

#### 4.2 Find or Create Pattern
```typescript
{
  type: "notion_action_find_or_create",
  title: "Find or Create Database Item",
  description: "Search for an item matching criteria, create if not found (upsert pattern)",
  configSchema: [
    { name: "database", label: "Database", type: "select", dynamic: "notion_databases" },
    { name: "searchProperty", label: "Search By Property", type: "select",
      dynamic: "notion_database_properties", dependsOn: "database"
    },
    { name: "searchValue", label: "Search Value", type: "text" },
    // If not found, create with these properties
    { name: "createProperties", label: "Properties for New Item", type: "dynamic_fields",
      dynamic: "notion_database_properties", dependsOn: "database"
    }
  ],
  outputSchema: [
    { name: "found", label: "Item Was Found", type: "boolean" },
    { name: "created", label: "Item Was Created", type: "boolean" },
    { name: "pageId", label: "Page ID", type: "string" },
    { name: "properties", label: "Properties", type: "object" }
  ]
}
```

#### 4.3 Find Page by Title
```typescript
{
  type: "notion_action_find_page",
  title: "Find Page",
  description: "Search for pages by title or other criteria",
  configSchema: [
    { name: "searchType", label: "Search Type", type: "select", options: [
      { value: "title", label: "By Title" },
      { value: "url", label: "By URL" },
      { value: "id", label: "By ID" }
    ]},
    { name: "searchValue", label: "Search Value", type: "text" },
    { name: "filterType", label: "Filter Results", type: "select", options: [
      { value: "all", label: "All (Pages & Databases)" },
      { value: "page", label: "Pages Only" },
      { value: "database", label: "Databases Only" }
    ]},
    { name: "maxResults", label: "Max Results", type: "number", defaultValue: 10 }
  ]
}
```

---

### Phase 5: Block-Level Operations (MEDIUM - 1-2 days)

#### 5.1 Add Block Actions
```typescript
{
  type: "notion_action_add_block",
  title: "Add Block to Page",
  description: "Add a specific block type (heading, list, callout, etc.) to a page",
  configSchema: [
    { name: "page", label: "Page", type: "select", dynamic: "notion_pages" },
    { name: "position", label: "Position", type: "select", options: [
      { value: "append", label: "End of Page" },
      { value: "prepend", label: "Beginning of Page" },
      { value: "after", label: "After Specific Block" }
    ]},
    { name: "afterBlock", label: "After Block ID", type: "text",
      visibilityCondition: { field: "position", operator: "equals", value: "after" }
    },
    { name: "blockType", label: "Block Type", type: "select", options: [
      { value: "paragraph", label: "Paragraph" },
      { value: "heading_1", label: "Heading 1" },
      { value: "heading_2", label: "Heading 2" },
      { value: "heading_3", label: "Heading 3" },
      { value: "bulleted_list_item", label: "Bullet List Item" },
      { value: "numbered_list_item", label: "Numbered List Item" },
      { value: "to_do", label: "To-Do" },
      { value: "toggle", label: "Toggle" },
      { value: "code", label: "Code Block" },
      { value: "quote", label: "Quote" },
      { value: "callout", label: "Callout" },
      { value: "divider", label: "Divider" },
      { value: "table_of_contents", label: "Table of Contents" },
      { value: "embed", label: "Embed" },
      { value: "bookmark", label: "Bookmark" }
    ]},
    // Dynamic fields based on block type
    { name: "content", label: "Content", type: "rich-text",
      visibilityCondition: { field: "blockType", operator: "in",
        value: ["paragraph", "heading_1", "heading_2", "heading_3", "quote", "callout"]
      }
    },
    { name: "checked", label: "Checked", type: "boolean",
      visibilityCondition: { field: "blockType", operator: "equals", value: "to_do" }
    },
    { name: "language", label: "Language", type: "select",
      options: [/* programming languages */],
      visibilityCondition: { field: "blockType", operator: "equals", value: "code" }
    }
  ]
}
```

#### 5.2 Get Block Operations
```typescript
{
  type: "notion_action_get_block",
  title: "Get Block",
  description: "Retrieve a specific block by ID",
  configSchema: [
    { name: "blockId", label: "Block ID", type: "text", required: true }
  ]
}

{
  type: "notion_action_get_page_and_children",
  title: "Get Page and Children",
  description: "Retrieve a page and all its child blocks",
  configSchema: [
    { name: "page", label: "Page", type: "select", dynamic: "notion_pages" },
    { name: "depth", label: "Depth", type: "select", options: [
      { value: "1", label: "Direct Children Only" },
      { value: "2", label: "2 Levels Deep" },
      { value: "all", label: "All Descendants" }
    ]},
    { name: "format", label: "Output Format", type: "select", options: [
      { value: "json", label: "JSON (Raw Blocks)" },
      { value: "markdown", label: "Markdown" },
      { value: "html", label: "HTML" }
    ]}
  ]
}

{
  type: "notion_action_get_block_children",
  title: "Get Block Children",
  description: "Get children of a block, rendered as Markdown",
  configSchema: [
    { name: "blockId", label: "Block ID", type: "text" },
    { name: "renderAsMarkdown", label: "Render as Markdown", type: "boolean", defaultValue: true }
  ]
}
```

---

### Phase 6: Database Schema Management (LOW - 1 day)

#### 6.1 Update Database Schema
```typescript
{
  type: "notion_action_update_database_schema",
  title: "Update Database Schema",
  description: "Add, modify, or remove database properties",
  configSchema: [
    { name: "database", label: "Database", type: "select", dynamic: "notion_databases" },
    { name: "operation", label: "Operation", type: "select", options: [
      { value: "add_property", label: "Add Property" },
      { value: "update_property", label: "Update Property" },
      { value: "remove_property", label: "Remove Property" }
    ]},
    // For add/update
    { name: "propertyName", label: "Property Name", type: "text",
      visibilityCondition: { field: "operation", operator: "in", value: ["add_property", "update_property"] }
    },
    { name: "propertyType", label: "Property Type", type: "select",
      options: [
        { value: "title", label: "Title" },
        { value: "rich_text", label: "Text" },
        { value: "number", label: "Number" },
        { value: "select", label: "Select" },
        { value: "multi_select", label: "Multi-Select" },
        { value: "date", label: "Date" },
        { value: "people", label: "Person" },
        { value: "files", label: "Files & Media" },
        { value: "checkbox", label: "Checkbox" },
        { value: "url", label: "URL" },
        { value: "email", label: "Email" },
        { value: "phone_number", label: "Phone" },
        { value: "formula", label: "Formula" },
        { value: "relation", label: "Relation" },
        { value: "rollup", label: "Rollup" },
        { value: "created_time", label: "Created Time" },
        { value: "created_by", label: "Created By" },
        { value: "last_edited_time", label: "Last Edited Time" },
        { value: "last_edited_by", label: "Last Edited By" }
      ],
      visibilityCondition: { field: "operation", operator: "equals", value: "add_property" }
    },
    // For remove
    { name: "existingProperty", label: "Property to Remove", type: "select",
      dynamic: "notion_database_properties", dependsOn: "database",
      visibilityCondition: { field: "operation", operator: "equals", value: "remove_property" }
    }
  ]
}
```

---

## 4. WEBHOOK IMPLEMENTATION PRIORITY

### Why Webhooks Are Critical

**Current State:** Polling-based triggers check every 1-15 minutes
**With Webhooks:** Real-time notifications (< 1 second)

**Benefits:**
1. **Performance:** Instant notifications vs delayed polling
2. **Efficiency:** No wasted API calls checking for changes
3. **Scalability:** Webhooks scale better than polling
4. **User Experience:** Real-time automation feels more responsive

### Webhook Implementation Checklist

- [ ] **Webhook Lifecycle Handler** (`TriggerLifecycleManager` pattern)
  - [ ] `onActivate()` - Create webhook subscription via Notion API
  - [ ] `onDeactivate()` - Delete webhook subscription
  - [ ] `onDelete()` - Clean up webhook and database records
  - [ ] `checkHealth()` - Verify webhook is still active

- [ ] **Webhook Endpoint** (`/app/api/webhooks/notion/route.ts`)
  - [ ] Validate webhook signature (Notion sends `x-notion-signature` header)
  - [ ] Handle validation handshake (Notion sends challenge on setup)
  - [ ] Parse webhook payload
  - [ ] Trigger workflow execution
  - [ ] Return 200 OK within 3 seconds (or Notion retries)

- [ ] **Database Schema** (use existing `webhook_configs` table)
  - [ ] Store: `integration_id`, `webhook_id`, `event_type`, `page_id`, `database_id`
  - [ ] Handle webhook renewal for expiring subscriptions (if applicable)

- [ ] **Event Types to Support**
  - [ ] `page.created`
  - [ ] `page.updated` (properties)
  - [ ] `page.content_updated` (blocks/content)
  - [ ] `comment.created`
  - [ ] `data_source.schema_updated` (2025-09-03 API version)

### Reference Implementations
- **MS Teams Webhooks:** `/lib/triggers/microsoft-teams/webhook-lifecycle.ts`
- **Webhook Documentation:** `/learning/docs/action-trigger-implementation-guide.md`

---

## 5. API CAPABILITY VERIFICATION

### Required Notion API Capabilities

To support all missing features, ensure integration has these capabilities enabled:

| Capability | Required For | Currently Have? |
|-----------|-------------|-----------------|
| `content.read` | Read pages, databases, blocks | ✅ |
| `content.write` | Create/update pages, databases, blocks | ✅ |
| `comment.read` | Read comments, trigger on new comments | ❓ |
| `comment.write` | Create comments | ❓ |
| `users.read` | List users, get user details | ✅ |

**Action Required:** Verify OAuth scopes include comment capabilities

---

## 6. COMPETITIVE FEATURE MATRIX

### Full Feature Comparison

| Feature | ChainReact | Zapier | Make.com | Priority |
|---------|-----------|--------|----------|----------|
| **TRIGGERS** |
| New Page in Database | ✅ Polling | ✅ Webhook | ✅ Webhook | Upgrade to webhook |
| Page Updated | ✅ Polling | ✅ Webhook | ✅ Webhook | Upgrade to webhook |
| Database Item Created | ❌ | ✅ | ✅ | HIGH |
| Database Item Updated | ❌ | ✅ | ✅ | HIGH |
| Page Content Updated | ❌ | ✅ | ✅ | HIGH |
| Page Properties Updated | ❌ | ✅ | ❌ | HIGH |
| New Comment | ❌ | ✅ | ❌ | HIGH |
| Database Schema Updated | ❌ | ❌ | ❌ | MEDIUM |
| **ACTIONS - Core** |
| Create Page | ✅ | ✅ | ✅ | ✅ |
| Update Page | ✅ | ✅ | ✅ | ✅ |
| Append to Page | ✅ | ✅ | ✅ | ✅ |
| Get Page Details | ✅ | ✅ | ❌ | ✅ |
| Archive Page | ✅ | ✅ | ✅ | ✅ |
| Duplicate Page | ✅ | ❌ | ❌ | ✅ |
| Create Database | ✅ | ❌ | ✅ | ✅ |
| Update Database | ✅ | ✅ | ✅ | ✅ |
| **ACTIONS - Comments** |
| Add Comment | ✅ | ✅ | ❌ | ✅ |
| Get Comments | ✅ | ✅ | ❌ | ✅ |
| **ACTIONS - Files** |
| Upload File | ❌ | ✅ | ❌ | HIGH |
| **ACTIONS - Advanced Search** |
| Search Objects | ✅ | ✅ | ✅ | ✅ |
| Advanced Query (JSON) | ✅ | ✅ | ❌ | ✅ |
| Find Page by Title | ✅ | ✅ | ❌ | ✅ (Search Objects) |
| Find or Create | ✅ | ✅ | ❌ | ✅ |
| **ACTIONS - Blocks** |
| Add Block | ✅ | ✅ | ❌ | ✅ |
| Get Block | ✅ | ✅ | ❌ | ✅ |
| Get Page + Children | ✅ | ✅ | ❌ | ✅ |
| Get Block Children | ✅ | ✅ | ❌ | ✅ |
| Get Page Property | ✅ | ✅ | ❌ | ✅ |
| **ACTIONS - Database Schema** |
| Update Schema | ✅ | ✅ | ❌ | ✅ |
| **ACTIONS - Misc** |
| Archive Database Item | ✅ | ✅ | ❌ | ✅ |
| Restore Archived Item | ✅ | ✅ | ❌ | ✅ |
| Retrieve Database | ❌ | ✅ | ❌ | LOW |
| Custom API Request | ✅ | ✅ (Beta) | ✅ | ✅ |
| **USER MANAGEMENT** |
| List Users | ✅ | ❌ | ❌ | ✅ Advantage |
| Get User Details | ✅ | ❌ | ❌ | ✅ Advantage |

### Our Competitive Advantages

**What We Have That Competitors Don't:**
1. ✅ **Duplicate Page** - Neither Zapier nor Make.com offer this
2. ✅ **Unified Action Pattern** - Cleaner UX with operation dropdowns
3. ✅ **User Management** - List and get user details
4. ✅ **Granular Content Actions** - 5 specialized content management actions

**What We're Missing That Both Competitors Have:**
1. ❌ **Webhook-based triggers** (both have real-time webhooks)
2. ❌ **Comment management** (Zapier has this, Make.com doesn't)
3. ❌ **File uploads** (Zapier has this, Make.com doesn't)

---

## 7. IMPLEMENTATION TIMELINE

### Aggressive Timeline (2-3 weeks)

**Week 1: High-Priority Triggers & Comments**
- Days 1-3: Webhook infrastructure + lifecycle handlers
- Days 4-5: Convert existing triggers to webhooks + add new triggers
- Days 6-7: Comment actions (add comment, get comments)

**Week 2: Files, Archive, Advanced Search**
- Days 1-2: File upload action + temporary hosting integration
- Day 3: Restore archived items action
- Days 4-7: Advanced query, find/create, find by title

**Week 3: Block Operations & Polish**
- Days 1-2: Add block action
- Days 3-4: Get block operations (get block, get children, get page+children)
- Day 5: Database schema update action
- Days 6-7: Testing, documentation, bug fixes

### Conservative Timeline (4-6 weeks)

**Weeks 1-2: Webhook Migration (Phase 1)**
- Focus on rock-solid webhook implementation
- Convert all existing triggers to webhooks first
- Then add new webhook triggers
- Extensive testing of webhook lifecycle

**Week 3: Comments & Files (Phases 2-3)**
- Comment management
- File upload infrastructure
- Archive/restore enhancements

**Weeks 4-5: Advanced Features (Phases 4-5)**
- Advanced search/query
- Block-level operations
- Find or create patterns

**Week 6: Schema Management & Polish (Phase 6)**
- Database schema updates
- Documentation
- Testing
- Bug fixes

---

## 8. TESTING REQUIREMENTS

### Webhook Testing Checklist
- [ ] Webhook creation on workflow activation
- [ ] Webhook deletion on workflow deactivation
- [ ] Webhook deletion on workflow deletion
- [ ] Signature validation
- [ ] Validation handshake handling
- [ ] Event filtering (only trigger for configured databases/pages)
- [ ] Duplicate event handling (Notion may send duplicates)
- [ ] Retry handling (Notion retries on 5xx errors)
- [ ] Health check monitoring
- [ ] Webhook renewal (if subscriptions expire)

### Action Testing Checklist
- [ ] Comment creation with/without discussion threading
- [ ] Comment retrieval with pagination
- [ ] File upload to different target types (page blocks, database properties)
- [ ] Advanced query with complex AND/OR filters
- [ ] Find or create pattern (both finding existing and creating new)
- [ ] Block creation for all block types
- [ ] Block retrieval with different depth levels
- [ ] Markdown conversion accuracy
- [ ] Schema updates (add/modify/remove properties)

---

## 9. DOCUMENTATION REQUIREMENTS

When implementing these features, update:

- [ ] `/learning/docs/action-trigger-implementation-guide.md`
  - Add Notion webhook implementation section
  - Document new action patterns (comments, files, blocks)

- [ ] `/learning/docs/webhook-lifecycle-guide.md` (create if doesn't exist)
  - Document webhook lifecycle pattern
  - Include Notion-specific validation/handshake

- [ ] `/learning/walkthroughs/notion-webhook-implementation.md` (create)
  - Step-by-step walkthrough of webhook implementation
  - Include troubleshooting section

- [ ] `/learning/logs/CHANGELOG.md`
  - Document all new triggers and actions
  - Note breaking changes if any

- [ ] Update `CLAUDE.md` if new patterns emerge

---

## 10. CONCLUSION

### Summary

**Current State:**
- 2 triggers (polling-based, 25% coverage)
- 8 unified actions (32% coverage)
- Missing critical features: real-time webhooks, comments, files

**Target State:**
- 8+ triggers (webhook-based, 100%+ coverage vs competitors)
- 25+ actions (100%+ coverage vs competitors)
- Feature parity or advantage in all major categories

### Recommended Prioritization

**Phase 1 (CRITICAL):** Webhook infrastructure + migration
- This unlocks real-time automation (biggest UX improvement)
- Competitive parity with Zapier and Make.com
- Estimated: 2-3 days

**Phase 2 (HIGH):** Comments + Files + Archive/Restore
- High-demand features users expect
- Zapier has these, we don't
- Estimated: 3 days

**Phase 3 (MEDIUM):** Advanced search + Block operations
- Power user features
- Differentiation from Make.com
- Estimated: 3-4 days

**Phase 4 (NICE-TO-HAVE):** Database schema management
- Advanced feature for automation experts
- Neither competitor has this extensively
- Estimated: 1 day

### Success Metrics

**Technical:**
- [ ] Webhook delivery latency < 3 seconds (p95)
- [ ] 99.9% webhook delivery success rate
- [ ] Support all Notion API block types
- [ ] Zero dropped webhook events

**Business:**
- [ ] Feature parity with Zapier for Notion (100% coverage of their triggers/actions)
- [ ] Feature advantage over Make.com (we have everything they have + more)
- [ ] Enable 10+ new workflow templates using new features
- [ ] Reduce "feature request" tickets for Notion by 80%

---

**Questions or Clarifications Needed:**

1. Do we have access to Notion's comment.read/comment.write scopes?
2. What's our strategy for file hosting (S3, Cloudinary, other)?
3. Should we implement webhook subscription renewal, or do Notion webhooks not expire?
4. Priority preference: Aggressive (2-3 weeks) or Conservative (4-6 weeks) timeline?
