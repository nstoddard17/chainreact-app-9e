import { FileText, MessageSquare, Plus, Database, Search, Edit, List, FilePlus, Trash2, Code } from "lucide-react"
import { NodeComponent } from "../../types"

// Import Notion action metadata if it exists
const NOTION_CREATE_PAGE_METADATA = { key: "notion_action_create_page", name: "Create Page", description: "Create a new page in Notion" }

// Import unified actions (excluding manage_page which is now separated)
import { notionUnifiedActions } from './unified-actions'

// Import separate page actions (replaces notion_action_manage_page)
import { notionPageActions } from './page-actions'

// Import separate database actions (replaces notion_action_manage_database)
import { notionDatabaseActions } from './database-actions'

// Import separate comment actions (replaces notion_action_manage_comments)
import { notionCommentActions } from './comment-actions'

// Import separate user actions (replaces notion_action_manage_users)
import { notionUserActions } from './user-actions'

// Import separate block actions (replaces notion_action_manage_blocks)
import { notionBlockActions } from './block-actions'

// Import granular page content actions
import { listPageContentActionSchema } from './actions/listPageContent.schema'
// NOTE: getPageContentActionSchema removed - duplicate of listPageContentActionSchema
import { appendPageContentActionSchema } from './actions/appendPageContent.schema'
// NOTE: updatePageContentActionSchema removed - redundant with Update Page action
import { deletePageContentActionSchema } from './actions/deletePageContent.schema'
import { searchObjectsActionSchema } from './actions/searchObjects.schema'
import { makeApiCallActionSchema } from './actions/makeApiCall.schema'

// Apply icons to granular page content actions
const listPageContent: NodeComponent = {
  ...listPageContentActionSchema,
  icon: List
}

const appendPageContent: NodeComponent = {
  ...appendPageContentActionSchema,
  icon: FilePlus
}

// NOTE: updatePageContent removed - redundant with Update Page action

const deletePageContent: NodeComponent = {
  ...deletePageContentActionSchema,
  icon: Trash2
}

const searchObjects: NodeComponent = {
  ...searchObjectsActionSchema,
  icon: Search
}

const makeApiCall: NodeComponent = {
  ...makeApiCallActionSchema,
  icon: Code
}

// Use separate page actions + database actions + comment actions + user actions + block actions + other unified actions
export const notionNodes: NodeComponent[] = [
  // === Page Actions (Main Workflow Tools) ===
  ...notionPageActions,

  // === Database Actions (Database Management) ===
  ...notionDatabaseActions,

  // === Comment Actions (Comment Management) ===
  ...notionCommentActions,

  // === User Actions (User Management) ===
  ...notionUserActions,

  // === Block Actions (Block Management) ===
  ...notionBlockActions,

  // === Other Unified Actions ===
  // Filter out manage_page, manage_database, manage_comments, manage_users, and manage_blocks as they've been replaced by separate actions
  ...notionUnifiedActions.filter(action =>
    action.type !== 'notion_action_manage_page' &&
    action.type !== 'notion_action_manage_database' &&
    action.type !== 'notion_action_manage_comments' &&
    action.type !== 'notion_action_manage_users' &&
    action.type !== 'notion_action_manage_blocks'
  ),

  // === Granular Page Content Actions (Advanced Content Management) ===
  listPageContent,
  // NOTE: getPageContent removed - duplicate of listPageContent
  appendPageContent,
  // NOTE: updatePageContent removed - redundant with Update Page action
  deletePageContent,

  // === Advanced Features ===
  searchObjects,
  makeApiCall,

  // === Triggers ===
  {
    type: "notion_trigger_new_page",
    title: "New Page in Database",
    description: "Triggers when a page is added to a database",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: true, dependsOn: "workspace" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the page" },
      { name: "databaseId", label: "Database ID", type: "string", description: "The unique ID of the database" },
      { name: "title", label: "Title", type: "string", description: "The title of the page" },
      { name: "url", label: "URL", type: "string", description: "The URL of the page" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the page was created" }
    ]
  },
  {
    type: "notion_trigger_page_updated",
    title: "Page Updated",
    description: "Triggers when a page's properties or content are updated",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: true, dependsOn: "workspace" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the page" },
      { name: "title", label: "Title", type: "string", description: "The title of the page" },
      { name: "changedProperties", label: "Changed Properties", type: "object", description: "The properties that were changed" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the page was updated" },
      { name: "url", label: "URL", type: "string", description: "The URL of the page" }
    ]
  },

  // === Webhook-based Triggers ===
  {
    type: "notion_trigger_new_comment",
    title: "New Comment",
    description: "Triggers when a new comment is created on a page or discussion",
    icon: MessageSquare,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      {
        name: "filterType",
        label: "Filter By",
        type: "select",
        required: false,
        options: [
          { value: "all", label: "All Comments" },
          { value: "database", label: "Specific Database" },
          { value: "page", label: "Specific Page" }
        ],
        defaultValue: "all",
        description: "Filter comments by database or page"
      },
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: false,
        dependsOn: "workspace",
        visibilityCondition: { field: "filterType", operator: "equals", value: "database" },
        description: "Only trigger for comments on pages in this database"
      },
      {
        name: "page",
        label: "Page",
        type: "select",
        dynamic: "notion_pages",
        required: false,
        dependsOn: "workspace",
        visibilityCondition: { field: "filterType", operator: "equals", value: "page" },
        description: "Only trigger for comments on this specific page"
      }
    ],
    outputSchema: [
      { name: "commentId", label: "Comment ID", type: "string", description: "The unique ID of the comment" },
      { name: "parentId", label: "Parent ID", type: "string", description: "ID of the page or discussion" },
      { name: "parentType", label: "Parent Type", type: "string", description: "Type of parent (page or discussion)" },
      { name: "text", label: "Comment Text", type: "string", description: "The text content of the comment" },
      { name: "createdBy", label: "Created By", type: "object", description: "User who created the comment" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the comment was created" },
      { name: "discussionId", label: "Discussion ID", type: "string", description: "ID of the discussion thread (if applicable)" }
    ]
  },
  {
    type: "notion_trigger_database_item_created",
    title: "New Database Item",
    description: "Triggers when a new item (page) is created in a database",
    icon: FilePlus,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: true, dependsOn: "workspace" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the database item" },
      { name: "databaseId", label: "Database ID", type: "string", description: "The unique ID of the database" },
      { name: "title", label: "Title", type: "string", description: "The title of the database item" },
      { name: "url", label: "URL", type: "string", description: "The URL of the database item" },
      { name: "properties", label: "Properties", type: "object", description: "All properties of the database item" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the item was created" },
      { name: "createdBy", label: "Created By", type: "object", description: "User who created the item" }
    ]
  },
  {
    type: "notion_trigger_database_item_updated",
    title: "Database Item Updated",
    description: "Triggers when a database item's properties or content are updated",
    icon: Edit,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: true, dependsOn: "workspace" },
      {
        name: "updateType",
        label: "Update Type",
        type: "select",
        required: false,
        options: [
          { value: "any", label: "Any Update" },
          { value: "properties", label: "Properties Only" },
          { value: "content", label: "Content Only" }
        ],
        defaultValue: "any",
        description: "Filter by type of update"
      }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the database item" },
      { name: "databaseId", label: "Database ID", type: "string", description: "The unique ID of the database" },
      { name: "title", label: "Title", type: "string", description: "The title of the database item" },
      { name: "url", label: "URL", type: "string", description: "The URL of the database item" },
      { name: "properties", label: "Properties", type: "object", description: "Current properties of the database item" },
      { name: "changedProperties", label: "Changed Properties", type: "array", description: "List of property names that changed" },
      { name: "contentUpdated", label: "Content Updated", type: "boolean", description: "Whether the content/blocks were updated" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the item was updated" },
      { name: "updatedBy", label: "Updated By", type: "object", description: "User who updated the item" }
    ]
  },
  {
    type: "notion_trigger_page_content_updated",
    title: "Page Content Updated",
    description: "Triggers when a page's content (blocks) are updated",
    icon: Edit,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: false, dependsOn: "workspace", description: "Leave empty to watch all pages" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the page" },
      { name: "title", label: "Title", type: "string", description: "The title of the page" },
      { name: "url", label: "URL", type: "string", description: "The URL of the page" },
      { name: "updatedBlocks", label: "Updated Blocks", type: "array", description: "Blocks that were updated" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the content was updated" },
      { name: "updatedBy", label: "Updated By", type: "object", description: "User who updated the content" }
    ]
  },
  {
    type: "notion_trigger_page_properties_updated",
    title: "Page Properties Updated",
    description: "Triggers when a page's properties are updated (excluding content)",
    icon: Edit,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: false, dependsOn: "workspace", description: "Leave empty to watch all pages" },
      {
        name: "watchProperties",
        label: "Watch Specific Properties",
        type: "text",
        required: false,
        placeholder: "Status, Priority, Assignee",
        description: "Comma-separated list of property names to watch. Leave empty to watch all properties.",
        supportsAI: true
      }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string", description: "The unique ID of the page" },
      { name: "title", label: "Title", type: "string", description: "The title of the page" },
      { name: "url", label: "URL", type: "string", description: "The URL of the page" },
      { name: "properties", label: "Properties", type: "object", description: "Current properties of the page" },
      { name: "changedProperties", label: "Changed Properties", type: "object", description: "Properties that were changed with old and new values" },
      { name: "propertyNames", label: "Changed Property Names", type: "array", description: "Names of properties that changed" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the properties were updated" },
      { name: "updatedBy", label: "Updated By", type: "object", description: "User who updated the properties" }
    ]
  },
  {
    type: "notion_trigger_database_schema_updated",
    title: "Database Schema Updated",
    description: "Triggers when a database's schema (properties) are updated",
    icon: Database,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    webhookBased: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: true, loadOnMount: true },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: false, dependsOn: "workspace", description: "Leave empty to watch all databases" }
    ],
    outputSchema: [
      { name: "databaseId", label: "Database ID", type: "string", description: "The unique ID of the database" },
      { name: "title", label: "Database Title", type: "string", description: "The title of the database" },
      { name: "url", label: "URL", type: "string", description: "The URL of the database" },
      { name: "properties", label: "Properties", type: "object", description: "Current database schema properties" },
      { name: "addedProperties", label: "Added Properties", type: "array", description: "Properties that were added" },
      { name: "removedProperties", label: "Removed Properties", type: "array", description: "Properties that were removed" },
      { name: "modifiedProperties", label: "Modified Properties", type: "array", description: "Properties that were modified" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the schema was updated" },
      { name: "updatedBy", label: "Updated By", type: "object", description: "User who updated the schema" }
    ]
  },
]

// Export individual nodes for direct access
export {
  // Granular page content actions
  listPageContent,
  // NOTE: getPageContent removed - duplicate of listPageContent
  appendPageContent,
  updatePageContent,
  deletePageContent,
  searchObjects,
  makeApiCall,
}

  // DEPRECATED: Replaced by notion_action_manage_page with operation="create"
  /*
  {
    type: "notion_action_create_page",
    title: "Create Page",
    description: "Create a new page in Notion",
    icon: Plus,
    providerId: "notion",
    requiredScopes: ["insert"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select", 
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace",
        description: "Select the workspace where you want to create the page."
      },
      { 
        name: "database", 
        label: "Database (Optional)", 
        type: "select", 
        dynamic: "notion_databases",
        required: false,
        placeholder: "Select database (leave empty for root level)",
        description: "Choose a database to create the page in. Leave empty to create at the root level.",
        dependsOn: "workspace"
      },
      { 
        name: "databaseProperties", 
        label: "Database Properties (Optional)", 
        type: "select", 
        dynamic: "notion_database_properties",
        required: false,
        placeholder: "Select database properties to set",
        description: "Choose properties from the selected database to set values for the new page.",
        dependsOn: "database"
      },
      { 
        name: "title", 
        label: "Page Title", 
        type: "text", 
        required: true,
        placeholder: "Enter page title"
      },
      { 
        name: "icon", 
        label: "Icon (Optional)", 
        type: "file", 
        required: false,
        placeholder: "Select emoji, upload file, or enter URL",
        accept: "image/*,.svg,.png,.jpg,.jpeg,.gif",
        maxSize: 5242880, // 5MB
        description: "Upload an image file, enter an emoji, or provide a URL"
      },
      { 
        name: "cover", 
        label: "Cover Image (Optional)", 
        type: "file", 
        required: false,
        placeholder: "Upload file, enter URL, or select from previous nodes",
        accept: "image/*,.jpg,.jpeg,.png,.gif,.webp",
        maxSize: 10485760, // 10MB
        description: "Upload an image file, enter a URL, or select from previous node outputs"
      },
      { 
        name: "template", 
        label: "Template (Optional)", 
        type: "select", 
        dynamic: "notion_templates",
        required: false,
        placeholder: "Select a template"
      },
      { 
        name: "page_content", 
        label: "Page Content", 
        type: "rich-text", 
        required: false,
        placeholder: "Enter the main content of your page"
      },
      { 
        name: "heading_1", 
        label: "Heading 1 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Main heading for the page"
      },
      { 
        name: "heading_2", 
        label: "Heading 2 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Secondary heading"
      },
      { 
        name: "heading_3", 
        label: "Heading 3 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Tertiary heading"
      },
      {
        name: "bullet_list",
        label: "Bullet List (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Enter list items, one per line",
        supportsVariables: true,
        hasConnectButton: true
      },
      {
        name: "numbered_list",
        label: "Numbered List (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Enter list items, one per line",
        supportsVariables: true,
        hasConnectButton: true
      },
      {
        name: "quote",
        label: "Quote (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Enter a quote or callout text",
        supportsVariables: true,
        hasConnectButton: true
      },
      {
        name: "code_block",
        label: "Code Block (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Enter code or technical content",
        supportsVariables: true,
        hasConnectButton: true
      },
      { 
        name: "divider", 
        label: "Add Divider", 
        type: "boolean", 
        required: false,
        defaultValue: false
      }
    ],
    outputSchema: [
      {
        name: "pageId",
        label: "Page ID",
        type: "string",
        description: "The unique ID of the created page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The web URL of the created page"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the page was created"
      },
      {
        name: "properties",
        label: "Page Properties",
        type: "object",
        description: "The properties of the created page"
      }
    ]
  },
  */
  // DEPRECATED: Replaced by notion_action_manage_page with operation="append"
  /*
  {
    type: "notion_action_append_to_page",
    title: "Append to Page",
    description: "Append content to an existing page",
    icon: Plus,
    providerId: "notion",
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: true, placeholder: "Select a page" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Content to append", supportsVariables: true, hasConnectButton: true }
    ]
  },
  */
  // DEPRECATED: Replaced by notion_action_manage_database with operation="create"
  /*
  {
    type: "notion_action_create_database",
    title: "Create Database",
    description: "Create a new database in Notion with advanced configuration",
    icon: Database,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select", 
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace"
      },
      { 
        name: "template", 
        label: "Template", 
        type: "select", 
        required: false,
        options: [
          { value: "Project Tracker", label: "Project Tracker" },
          { value: "CRM", label: "CRM" },
          { value: "Content Calendar", label: "Content Calendar" },
          { value: "Task Management", label: "Task Management" },
          { value: "Bug Tracker", label: "Bug Tracker" },
          { value: "Feature Requests", label: "Feature Requests" },
          { value: "Customer Support", label: "Customer Support" },
          { value: "Sales Pipeline", label: "Sales Pipeline" },
          { value: "Marketing Campaigns", label: "Marketing Campaigns" },
          { value: "Event Planning", label: "Event Planning" },
          { value: "Product Roadmap", label: "Product Roadmap" },
          { value: "Team Directory", label: "Team Directory" },
          { value: "Knowledge Base", label: "Knowledge Base" },
          { value: "Inventory Management", label: "Inventory Management" },
          { value: "Expense Tracker", label: "Expense Tracker" },
          { value: "Time Tracking", label: "Time Tracking" },
          { value: "Meeting Notes", label: "Meeting Notes" },
          { value: "Research Database", label: "Research Database" },
          { value: "Learning Management", label: "Learning Management" }
        ],
        placeholder: "Select template (optional)"
      },
      { 
        name: "databaseType", 
        label: "Database Type", 
        type: "select", 
        required: true,
        defaultValue: "Full page",
        options: [
          { value: "Full page", label: "Full page" },
          { value: "Inline", label: "Inline" }
        ],
        placeholder: "Select database type"
      },
      { 
        name: "title", 
        label: "Title", 
        type: "text", 
        required: true, 
        placeholder: "Enter database title" 
      },
      { 
        name: "description", 
        label: "Description", 
        type: "textarea", 
        required: false, 
        placeholder: "Enter database description (optional)" 
      },
      { 
        name: "icon", 
        label: "Icon", 
        type: "custom", 
        required: false,
        description: "Upload or provide URL for database icon"
      },
      { 
        name: "cover", 
        label: "Cover", 
        type: "custom", 
        required: false,
        description: "Upload or provide URL for database cover image"
      },
      { 
        name: "properties", 
        label: "Properties", 
        type: "custom", 
        required: true,
        description: "Configure database properties with types and options"
      },
      { 
        name: "views", 
        label: "Views", 
        type: "custom", 
        required: false,
        description: "Configure database views (optional)"
      }
    ],
    outputSchema: [
      {
        name: "databaseId",
        label: "Database ID",
        type: "string",
        description: "The unique ID of the created database"
      },
      {
        name: "databaseTitle",
        label: "Database Title",
        type: "string",
        description: "The title of the created database"
      },
      {
        name: "databaseUrl",
        label: "Database URL",
        type: "string",
        description: "The URL to access the database in Notion"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the database was created"
      },
      {
        name: "lastEditedTime",
        label: "Last Edited Time",
        type: "string",
        description: "When the database was last edited"
      }
    ]
  },
  */
  // DEPRECATED: Replaced by notion_action_search
  /*
  {
    type: "notion_action_search_pages",
    title: "Search Pages",
    description: "Search for pages in Notion",
    icon: Search,
    providerId: "notion",
    requiredScopes: ["content.read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "query", label: "Search Query", type: "text", required: false, placeholder: "Enter search terms" },
      { name: "filter", label: "Filter", type: "select", required: false, options: [
        { value: "page", label: "Pages" },
        { value: "database", label: "Databases" }
      ] },
      { name: "maxResults", label: "Max Results", type: "number", required: false, defaultValue: 10, placeholder: "10" }
    ]
  },
  */
  // DEPRECATED: Replaced by notion_action_manage_page with operation="update"
  /*
  {
    type: "notion_action_update_page",
    title: "Update Page",
    description: "Update an existing Notion page",
    icon: Edit,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: true, placeholder: "Select a page" },
      { name: "title", label: "New Title", type: "text", required: false, placeholder: "New page title" },
      { name: "content", label: "Content", type: "textarea", required: false, placeholder: "New page content", supportsVariables: true, hasConnectButton: true }
    ]
  },
  */