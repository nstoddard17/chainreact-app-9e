import { FileText, Database, Users, Layers } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Unified Notion Actions - Consolidated version combining multiple related actions
 * Each action has an operation dropdown to select specific operations
 */

export const notionUnifiedActions: NodeComponent[] = [
  // ============= UNIFIED PAGE MANAGEMENT =============
  {
    type: "notion_action_manage_page",
    title: "Manage Page",
    description: "Create, update, get details, append content, archive, or duplicate Notion pages",
    icon: FileText,
    providerId: "notion",
    requiredScopes: ["content.read", "content.write"],
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
        visibilityCondition: "always"
      },
      {
        name: "operation",
        label: "Operation",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "create", label: "Create Page" },
          { value: "update", label: "Update Page" },
          { value: "append", label: "Append to Page" },
          { value: "get_details", label: "Get Page Details" },
          { value: "archive", label: "Archive/Unarchive Page" },
          { value: "duplicate", label: "Duplicate Page" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      // For operations that need an existing page
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hideLabel: true,
        visibilityCondition: { 
          field: "operation", 
          operator: "in",
          value: ["update", "append", "get_details", "archive", "duplicate"]
        }
      },
      // Parent type selection for create operation
      {
        name: "parentType",
        label: "Create In",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "database", label: "Database (as database entry)" },
          { value: "page", label: "Page (as child page)" }
        ],
        placeholder: "Select where to create the page",
        description: "Choose whether to create the page in a database or under another page",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      // Database selection for create operation when parentType is database
      {
        name: "parentDatabase",
        label: "Select Database",
        type: "select",
        dynamic: "notion_databases",
        required: false, // Will be validated conditionally based on parentType
        placeholder: "Select the database to create the page in",
        description: "The page will be created as an entry in this database",
        dependsOn: "workspace",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "create" },
            { field: "parentType", operator: "equals", value: "database" }
          ]
        }
      },
      // Parent page selection for create operation when parentType is page
      {
        name: "parentPage",
        label: "Parent Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: false, // Will be validated conditionally based on parentType
        placeholder: "Search for a parent page...",
        description: "The page will be created as a child of this page",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "create" },
            { field: "parentType", operator: "equals", value: "page" }
          ]
        }
      },
      // Title field for create page operation only (update uses pageFields)
      {
        name: "title",
        label: "Page Title",
        type: "text",
        required: true,
        placeholder: "Enter page title",
        visibilityCondition: {
          field: "operation",
          operator: "equals",
          value: "create"
        }
      },
      // Content field for create/append pages only (update uses pageFields)
      {
        name: "content",
        label: "Content",
        type: "textarea",
        required: false,
        placeholder: "Enter content with markdown-like formatting...",
        rows: 15, // Increased for more content
        description: "Formatting: # H1 | ## H2 | ### H3 | - bullet | 1. numbered | [] todo | [x] done | > quote | --- divider | ``` code",
        helpText: `Supported formatting:
• Headers: # H1, ## H2, ### H3
• Lists: - bullet, 1. numbered list
• Todos: [] unchecked, [x] checked
• Quotes: > quoted text
• Code: \`\`\` code block
• Divider: --- or ***`,
        visibilityCondition: {
          field: "operation",
          operator: "in",
          value: ["create", "append"]
        }
      },
      // Archive action for archive operation
      {
        name: "archiveAction",
        label: "Action",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "archive", label: "Archive Page" },
          { value: "unarchive", label: "Unarchive Page" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "archive" }
      },
      // Options for get_details
      {
        name: "includeProperties",
        label: "Include Properties",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "get_details" }
      },
      {
        name: "includeContent",
        label: "Include Content",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "get_details" }
      },
      // Duplicate destination for duplicate operation
      {
        name: "destinationPage",
        label: "Destination Parent Page (Optional)",
        type: "select",
        dynamic: "notion_pages",
        required: false,
        placeholder: "Select destination parent page",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "equals", value: "duplicate" }
      },
      // Dynamic block/property fields for update operation
      {
        name: "pageFields",
        label: "Page Properties & Blocks",
        type: "dynamic_fields",
        dynamic: "notion_page_blocks",
        dependsOn: "page",
        required: false,
        placeholder: "Loading page properties and blocks...",
        description: "Edit page properties and content blocks. Individual blocks are updated in place, preserving their history and metadata.",
        visibilityCondition: {
          field: "operation",
          operator: "equals",
          value: "update"
        }
      }
    ],
    outputSchema: [
      {
        name: "pageId",
        label: "Page ID",
        type: "string",
        description: "The unique ID of the page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the page"
      },
      {
        name: "properties",
        label: "Page Properties",
        type: "object",
        description: "The properties of the page"
      },
      {
        name: "content",
        label: "Page Content",
        type: "object",
        description: "The content blocks of the page"
      }
    ]
  },

  // ============= UNIFIED DATABASE MANAGEMENT =============
  {
    type: "notion_action_manage_database",
    title: "Manage Database",
    description: "Create, query, update, or sync Notion databases",
    icon: Database,
    providerId: "notion",
    requiredScopes: ["content.read", "content.write"],
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
        visibilityCondition: "always"
      },
      {
        name: "operation",
        label: "Operation",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "create", label: "Create Database" },
          { value: "update", label: "Update Database" },
          { value: "sync", label: "Sync Database Entries" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      // For operations that need an existing database
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select a database",
        dependsOn: "workspace",
        visibilityCondition: {
          field: "operation",
          operator: "in",
          value: ["update", "sync"]
        }
      },
      // Create database fields
      {
        name: "databaseType",
        label: "Database Type",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "Full page", label: "Full page" },
          { value: "Inline", label: "Inline" }
        ],
        description: "Full page databases are standalone, Inline databases are embedded in a page",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      {
        name: "parentPage",
        label: "Parent Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a parent page...",
        description: "The page where this database will be created",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      {
        name: "title",
        label: "Database Title",
        type: "text",
        required: true,
        placeholder: "Enter database title",
        visibilityCondition: {
          field: "operation",
          operator: "in",
          value: ["create", "update"]
        }
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Enter database description",
        visibilityCondition: {
          field: "operation",
          operator: "in",
          value: ["create", "update"]
        }
      },
      {
        name: "properties",
        label: "Database Properties",
        type: "custom",
        required: false,
        description: "Configure the database schema with properties like Status, Assignee, Due Date, etc.",
        tooltip: "Define the fields (properties) your database will have. Every database needs at least one Title property.",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      // Sync fields
      {
        name: "syncDirection",
        label: "Sync Direction",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "pull", label: "Pull from Notion" },
          { value: "push", label: "Push to Notion" },
          { value: "bidirectional", label: "Bidirectional Sync" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "sync" }
      }
    ],
    outputSchema: [
      {
        name: "databaseId",
        label: "Database ID",
        type: "string",
        description: "The unique ID of the database"
      },
      {
        name: "results",
        label: "Results",
        type: "array",
        description: "Query results or synced entries"
      },
      {
        name: "hasMore",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more results"
      }
    ]
  },

  // ============= UNIFIED USER MANAGEMENT =============
  {
    type: "notion_action_manage_users",
    title: "Manage Users",
    description: "List all users or get details about specific users in your workspace",
    icon: Users,
    providerId: "notion",
    requiredScopes: ["users.read"],
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
        visibilityCondition: "always"
      },
      {
        name: "operation",
        label: "Operation",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "list", label: "List All Users" },
          { value: "get", label: "Get User Details" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      {
        name: "userId",
        label: "User",
        type: "select",
        dynamic: "notion_users",
        required: true,
        placeholder: "Select a user",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "equals", value: "get" }
      },
      {
        name: "includeGuests",
        label: "Include Guests",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "list" }
      }
    ],
    outputSchema: [
      {
        name: "users",
        label: "Users",
        type: "array",
        description: "List of users (for list operation)"
      },
      {
        name: "user",
        label: "User",
        type: "object",
        description: "User details (for get operation)"
      }
    ]
  },

  // ============= GET PAGES FROM DATABASE =============
  {
    type: "notion_action_get_pages",
    title: "Get Pages from Database",
    description: "Retrieve pages from a specific Notion database with filtering and sorting",
    icon: Layers,
    providerId: "notion",
    requiredScopes: ["content.read"],
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
        loadOnMount: true
      },
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select a database",
        dependsOn: "workspace"
      },
      {
        name: "filterProperty",
        label: "Filter by Property (Optional)",
        type: "text",
        required: false,
        placeholder: "Property name to filter by"
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "text",
        required: false,
        placeholder: "Value to match"
      },
      {
        name: "sortProperty",
        label: "Sort by Property (Optional)",
        type: "text",
        required: false,
        placeholder: "Property name to sort by"
      },
      {
        name: "sortDirection",
        label: "Sort Direction",
        type: "select",
        required: false,
        options: [
          { value: "ascending", label: "Ascending" },
          { value: "descending", label: "Descending" }
        ],
        defaultValue: "ascending"
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Maximum number of pages to retrieve"
      }
    ],
    outputSchema: [
      {
        name: "pages",
        label: "Pages",
        type: "array",
        description: "Array of pages from the database"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of pages retrieved"
      },
      {
        name: "hasMore",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more pages available"
      }
    ]
  }
];