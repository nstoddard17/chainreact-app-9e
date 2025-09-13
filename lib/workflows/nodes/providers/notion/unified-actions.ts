import { FileText, Database, Search, Users, MessageSquare, Layers } from "lucide-react"
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
          { value: "create_database", label: "Create Database" },
          { value: "update", label: "Update Page" },
          { value: "update_database", label: "Update Database" },
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
      // For update database operation - database selection
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database to update",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "equals", value: "update_database" }
      },
      // Title field for create/update
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        placeholder: "Enter title",
        visibilityCondition: { 
          field: "operation", 
          operator: "in",
          value: ["create", "create_database", "update", "update_database"]
        }
      },
      // Content field for create/update/append pages only
      {
        name: "content",
        label: "Content",
        type: "rich-text",
        required: false,
        placeholder: "Enter content",
        visibilityCondition: { 
          field: "operation", 
          operator: "in",
          value: ["create", "update", "append"]
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
        description: "Edit page properties and content blocks",
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
          { value: "query", label: "Search Database" },
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
          value: ["query", "update", "sync"]
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
      // Query fields
      {
        name: "filter",
        label: "Filter",
        type: "json",
        required: false,
        placeholder: "Enter filter conditions (JSON)",
        visibilityCondition: { field: "operation", operator: "equals", value: "query" }
      },
      {
        name: "sorts",
        label: "Sort",
        type: "json",
        required: false,
        placeholder: "Enter sort conditions (JSON)",
        visibilityCondition: { field: "operation", operator: "equals", value: "query" }
      },
      {
        name: "limit",
        label: "Limit",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Maximum number of results",
        visibilityCondition: { field: "operation", operator: "equals", value: "query" }
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

  // ============= UNIFIED SEARCH =============
  {
    type: "notion_action_search",
    title: "Search Notion",
    description: "Search for pages and databases across your Notion workspace",
    icon: Search,
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
        visibilityCondition: "always"
      },
      {
        name: "query",
        label: "Search Query",
        type: "text",
        required: false,
        placeholder: "Enter search terms",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      {
        name: "filter",
        label: "Filter Type",
        type: "select",
        required: false,
        clearable: false,
        options: [
          { value: "all", label: "All" },
          { value: "page", label: "Pages Only" },
          { value: "database", label: "Databases Only" }
        ],
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      {
        name: "sort",
        label: "Sort By",
        type: "select",
        required: false,
        clearable: false,
        options: [
          { value: "relevance", label: "Relevance" },
          { value: "last_edited_time", label: "Last Edited" }
        ],
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      {
        name: "maxResults",
        label: "Max Results",
        type: "number",
        required: false,
        defaultValue: 10,
        placeholder: "10",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      }
    ],
    outputSchema: [
      {
        name: "results",
        label: "Search Results",
        type: "array",
        description: "Array of matching pages and databases"
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

  // ============= UNIFIED COMMENT MANAGEMENT =============
  {
    type: "notion_action_manage_comments",
    title: "Manage Comments",
    description: "Create or retrieve comments on Notion pages",
    icon: MessageSquare,
    providerId: "notion",
    requiredScopes: ["comments.read", "comments.write"],
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
          { value: "create", label: "Create Comment" },
          { value: "retrieve", label: "Get Comments" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      {
        name: "page",
        label: "Page",
        type: "select",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Select a page (must be shared with integration)",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "isNotEmpty" }
      },
      {
        name: "commentText",
        label: "Comment Text",
        type: "textarea",
        required: true,
        placeholder: "Enter your comment",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      {
        name: "parentId",
        label: "Parent Block ID (Optional)",
        type: "text",
        required: false,
        placeholder: "ID of block to comment on",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      {
        name: "includeResolved",
        label: "Include Resolved",
        type: "select",
        defaultValue: "false",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "retrieve" }
      }
    ],
    outputSchema: [
      {
        name: "commentId",
        label: "Comment ID",
        type: "string",
        description: "The ID of the created comment"
      },
      {
        name: "comments",
        label: "Comments",
        type: "array",
        description: "List of comments (for retrieve operation)"
      }
    ]
  }
];