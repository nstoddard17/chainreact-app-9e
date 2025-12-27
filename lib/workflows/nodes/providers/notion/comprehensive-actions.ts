import { FileText, MessageSquare, Plus, Database, Search, Edit, Trash, Users, Hash, Calendar, Link, Copy, Filter, FolderOpen, RefreshCw } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Comprehensive Notion Actions based on official API v2 capabilities
 * Reference: https://developers.notion.com/reference/intro
 * 
 * NOTE: The following actions already exist in index.ts and are excluded here to avoid duplicate keys:
 * - notion_action_create_page
 * - notion_action_update_page  
 * - notion_action_create_database
 * - notion_action_search_pages
 * - notion_action_append_to_page
 */

export const notionComprehensiveActions: NodeComponent[] = [
  // ============= PAGE ACTIONS =============
  {
    type: "notion_action_get_page_details",
    title: "Get Page Details",
    description: "Retrieve detailed information about a Notion page including properties and content",
    icon: FileText,
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
        visibilityCondition: "always" // Always show
      },
      { 
        name: "page", 
        label: "Page", 
        type: "select", 
        dynamic: "notion_pages",
        required: true,
        placeholder: "Select a page",
        dependsOn: "workspace",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" } // Show when workspace is selected
      },
      // Property filters - show after page is selected
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
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        helperText: "Include all page properties in the response"
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
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        helperText: "Include page content blocks"
      },
      { 
        name: "includeChildren", 
        label: "Include Child Pages", 
        type: "select", 
        defaultValue: "false",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        helperText: "Include information about child pages"
      },
      { 
        name: "includeComments", 
        label: "Include Comments", 
        type: "select", 
        defaultValue: "false",
        clearable: false,
        options: [
          { value: "true", label: "True" },
          { value: "false", label: "False" }
        ],
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        helperText: "Include page comments"
      },
      { 
        name: "propertyFilter", 
        label: "Filter by Property", 
        type: "text", 
        required: false,
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        placeholder: "e.g., Status = Done",
        helperText: "Filter results based on property values"
      },
      { 
        name: "dateFilter", 
        label: "Date Filter", 
        type: "select", 
        required: false,
        clearable: false,
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        options: [
          { value: "none", label: "No Filter" },
          { value: "today", label: "Today" },
          { value: "yesterday", label: "Yesterday" },
          { value: "this_week", label: "This Week" },
          { value: "last_week", label: "Last Week" },
          { value: "this_month", label: "This Month" },
          { value: "last_month", label: "Last Month" },
          { value: "last_7_days", label: "Last 7 Days" },
          { value: "last_30_days", label: "Last 30 Days" },
          { value: "last_90_days", label: "Last 90 Days" }
        ],
        defaultValue: "none",
        placeholder: "Filter by date"
      },
      { 
        name: "sortBy", 
        label: "Sort By", 
        type: "select", 
        required: false,
        clearable: false,
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        options: [
          { value: "none", label: "No Sorting" },
          { value: "created_time", label: "Created Date" },
          { value: "last_edited_time", label: "Last Edited" },
          { value: "title", label: "Title (A-Z)" },
          { value: "title_desc", label: "Title (Z-A)" }
        ],
        defaultValue: "none",
        placeholder: "Sort order"
      },
      { 
        name: "outputFormat", 
        label: "Output Format", 
        type: "select", 
        required: false,
        defaultValue: "full",
        visibilityCondition: { field: "page", operator: "isNotEmpty" },
        options: [
          { value: "full", label: "Full Details" },
          { value: "summary", label: "Summary Only" },
          { value: "properties", label: "Properties Only" },
          { value: "content", label: "Content Only" },
          { value: "metadata", label: "Metadata Only" }
        ],
        helperText: "Choose what information to include in the output"
      }
    ],
    outputSchema: [
      { name: "page_id", label: "Page ID", type: "string" },
      { name: "url", label: "Page URL", type: "string" },
      { name: "properties", label: "Page Properties", type: "object" },
      { name: "parent", label: "Parent Info", type: "object" },
      { name: "created_time", label: "Created Time", type: "string" },
      { name: "last_edited_time", label: "Last Edited Time", type: "string" },
      { name: "archived", label: "Is Archived", type: "boolean" }
    ]
  },

  // ============= DATABASE ACTIONS =============
  {
    type: "notion_action_query_database",
    title: "Search Database",
    description: "Search and filter database entries",
    icon: Search,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "database_id", 
        label: "Database", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_databases",
        required: true,
        placeholder: "Select a database",
        dependsOn: "workspace"
      },
      { 
        name: "filter_type", 
        label: "Filter Type", 
        type: "select",
        required: false,
        options: [
          { value: "none", label: "No filter (all entries)" },
          { value: "property", label: "Filter by property" },
          { value: "timestamp", label: "Filter by timestamp" }
        ],
        defaultValue: "none"
      },
      { 
        name: "filter_property", 
        label: "Filter Property", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_database_properties",
        required: false,
        dependsOn: { field: "filter_type", value: "property" }
      },
      { 
        name: "filter_condition", 
        label: "Filter Condition", 
        type: "filter_builder",
        required: false,
        dependsOn: { field: "filter_property" }
      },
      { 
        name: "sorts", 
        label: "Sort By", 
        type: "sort_builder",
        dynamic: true,
        dynamicOptions: "notion_database_properties",
        required: false,
        description: "Configure sorting",
        dependsOn: { field: "database_id" }
      },
      { 
        name: "page_size", 
        label: "Max Results", 
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100
      },
      { 
        name: "start_cursor", 
        label: "Start Cursor", 
        type: "text",
        required: false,
        placeholder: "For pagination (optional)"
      }
    ],
    outputSchema: [
      { name: "results", label: "Query Results", type: "array" },
      { name: "has_more", label: "Has More Results", type: "boolean" },
      { name: "next_cursor", label: "Next Cursor", type: "string" },
      { name: "total_results", label: "Total Results", type: "number" }
    ]
  },

  {
    type: "notion_action_update_database",
    title: "Update Database",
    description: "Update database title, description, or properties",
    icon: Edit,
    providerId: "notion",
    requiredScopes: ["update"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "database_id", 
        label: "Database", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_databases",
        required: true,
        placeholder: "Select a database",
        dependsOn: "workspace"
      },
      { 
        name: "title", 
        label: "New Title", 
        type: "text",
        required: false,
        placeholder: "New database title (optional)"
      },
      { 
        name: "description", 
        label: "New Description", 
        type: "textarea",
        required: false,
        placeholder: "New database description (optional)"
      },
      { 
        name: "properties_update", 
        label: "Update Properties", 
        type: "properties_updater",
        dynamic: true,
        dynamicOptions: "notion_database_properties",
        required: false,
        description: "Add or modify database properties",
        dependsOn: { field: "database_id" }
      },
      { 
        name: "archived", 
        label: "Archive Database", 
        type: "boolean",
        required: false,
        defaultValue: false
      }
    ],
    outputSchema: [
      { name: "database_id", label: "Database ID", type: "string" },
      { name: "url", label: "Database URL", type: "string" },
      { name: "last_edited_time", label: "Last Edited Time", type: "string" }
    ]
  },

  // ============= BLOCK ACTIONS =============
  {
    type: "notion_action_append_blocks",
    title: "Append Blocks to Page",
    description: "Add content blocks to an existing page",
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
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "page_id", 
        label: "Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: true,
        placeholder: "Select a page",
        dependsOn: "workspace"
      },
      { 
        name: "blocks", 
        label: "Content Blocks", 
        type: "blocks_builder",
        required: true,
        description: "Configure blocks to append"
      },
      { 
        name: "after", 
        label: "Insert After Block", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_page_blocks",
        required: false,
        placeholder: "Select block to insert after (optional)",
        dependsOn: { field: "page_id" }
      }
    ],
    outputSchema: [
      { name: "blocks", label: "Created Blocks", type: "array" },
      { name: "page_id", label: "Page ID", type: "string" }
    ]
  },

  {
    type: "notion_action_update_block",
    title: "Update Block",
    description: "Update content of a specific block",
    icon: Edit,
    providerId: "notion",
    requiredScopes: ["update"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "page_id", 
        label: "Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: true,
        placeholder: "Select a page",
        dependsOn: "workspace"
      },
      { 
        name: "block_id", 
        label: "Block", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_page_blocks",
        required: true,
        placeholder: "Select block to update",
        dependsOn: { field: "page_id" }
      },
      { 
        name: "block_content", 
        label: "New Content", 
        type: "block_editor",
        required: true,
        description: "Edit block content"
      },
      { 
        name: "archived", 
        label: "Archive Block", 
        type: "boolean",
        required: false,
        defaultValue: false
      }
    ],
    outputSchema: [
      { name: "block_id", label: "Block ID", type: "string" },
      { name: "type", label: "Block Type", type: "string" },
      { name: "last_edited_time", label: "Last Edited Time", type: "string" }
    ]
  },

  {
    type: "notion_action_delete_block",
    title: "Delete Block",
    description: "Delete a block from a page",
    icon: Trash,
    providerId: "notion",
    requiredScopes: ["update"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "page_id", 
        label: "Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: true,
        placeholder: "Select a page",
        dependsOn: "workspace"
      },
      { 
        name: "block_id", 
        label: "Block to Delete", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_page_blocks",
        required: true,
        placeholder: "Select block to delete",
        dependsOn: { field: "page_id" }
      }
    ],
    outputSchema: [
      { name: "block_id", label: "Deleted Block ID", type: "string" },
      { name: "archived", label: "Archived", type: "boolean" }
    ]
  },

  {
    type: "notion_action_retrieve_block_children",
    title: "Get Block Children",
    description: "Retrieve all child blocks of a parent block",
    icon: FolderOpen,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "block_id", 
        label: "Parent Block ID", 
        type: "text",
        required: true,
        placeholder: "Enter block ID"
      },
      { 
        name: "page_size", 
        label: "Max Results", 
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100
      }
    ],
    outputSchema: [
      { name: "children", label: "Child Blocks", type: "array" },
      { name: "has_more", label: "Has More", type: "boolean" },
      { name: "next_cursor", label: "Next Cursor", type: "string" }
    ]
  },

  // ============= USER ACTIONS =============
  {
    type: "notion_action_list_users",
    title: "List All Users",
    description: "Get all users in the workspace",
    icon: Users,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "page_size", 
        label: "Max Results", 
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100
      }
    ],
    outputSchema: [
      { name: "users", label: "Users List", type: "array" },
      { name: "has_more", label: "Has More", type: "boolean" },
      { name: "next_cursor", label: "Next Cursor", type: "string" }
    ]
  },

  {
    type: "notion_action_retrieve_user",
    title: "Get User Details",
    description: "Retrieve information about a specific user",
    icon: Users,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "user_id", 
        label: "User", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_users",
        required: true,
        placeholder: "Select a user",
        dependsOn: "workspace"
      }
    ],
    outputSchema: [
      { name: "user_id", label: "User ID", type: "string" },
      { name: "name", label: "Name", type: "string" },
      { name: "email", label: "Email", type: "string" },
      { name: "type", label: "User Type", type: "string" },
      { name: "avatar_url", label: "Avatar URL", type: "string" }
    ]
  },

  // ============= COMMENT ACTIONS =============
  {
    type: "notion_action_create_comment",
    title: "Create Comment",
    description: "Add a comment to a page or discussion",
    icon: MessageSquare,
    providerId: "notion",
    requiredScopes: ["insert"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "parent_type", 
        label: "Comment On", 
        type: "select",
        required: true,
        options: [
          { value: "page", label: "Page" },
          { value: "discussion", label: "Discussion Thread" }
        ]
      },
      { 
        name: "page_id", 
        label: "Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: false,
        placeholder: "Select a page",
        dependsOn: { field: "parent_type", value: "page" }
      },
      { 
        name: "discussion_id", 
        label: "Discussion", 
        type: "text",
        required: false,
        placeholder: "Enter discussion ID",
        dependsOn: { field: "parent_type", value: "discussion" }
      },
      { 
        name: "rich_text", 
        label: "Comment Text", 
        type: "rich_text",
        required: true,
        placeholder: "Enter your comment"
      }
    ],
    outputSchema: [
      { name: "comment_id", label: "Comment ID", type: "string" },
      { name: "created_time", label: "Created Time", type: "string" },
      { name: "parent", label: "Parent Info", type: "object" }
    ]
  },

  {
    type: "notion_action_retrieve_comments",
    title: "Get Comments",
    description: "Retrieve comments from a page or block",
    icon: MessageSquare,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "block_id", 
        label: "Page or Block ID", 
        type: "text",
        required: true,
        placeholder: "Enter page or block ID"
      },
      { 
        name: "page_size", 
        label: "Max Results", 
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100
      }
    ],
    outputSchema: [
      { name: "comments", label: "Comments", type: "array" },
      { name: "has_more", label: "Has More", type: "boolean" },
      { name: "next_cursor", label: "Next Cursor", type: "string" }
    ]
  },

  // ============= SEARCH ACTION =============
  {
    type: "notion_action_search",
    title: "Search Workspace",
    description: "Search for pages and databases across the workspace",
    icon: Search,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "query", 
        label: "Search Query", 
        type: "text",
        required: false,
        placeholder: "Enter search terms (optional)"
      },
      { 
        name: "filter_type", 
        label: "Filter By", 
        type: "select",
        required: false,
        options: [
          { value: "all", label: "All (Pages & Databases)" },
          { value: "page", label: "Pages Only" },
          { value: "database", label: "Databases Only" }
        ],
        defaultValue: "all"
      },
      { 
        name: "sort_direction", 
        label: "Sort Direction", 
        type: "select",
        required: false,
        options: [
          { value: "ascending", label: "Ascending (oldest first)" },
          { value: "descending", label: "Descending (newest first)" }
        ],
        defaultValue: "descending"
      },
      { 
        name: "sort_timestamp", 
        label: "Sort By", 
        type: "select",
        required: false,
        options: [
          { value: "last_edited_time", label: "Last Edited Time" },
          { value: "created_time", label: "Created Time" }
        ],
        defaultValue: "last_edited_time"
      },
      { 
        name: "page_size", 
        label: "Max Results", 
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100
      }
    ],
    outputSchema: [
      { name: "results", label: "Search Results", type: "array" },
      { name: "has_more", label: "Has More", type: "boolean" },
      { name: "next_cursor", label: "Next Cursor", type: "string" },
      { name: "object", label: "Result Type", type: "string" }
    ]
  },

  // ============= ADVANCED ACTIONS =============
  {
    type: "notion_action_duplicate_page",
    title: "Duplicate Page",
    description: "Create a copy of an existing page with all its content",
    icon: Copy,
    providerId: "notion",
    requiredScopes: ["read", "insert"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "source_page_id", 
        label: "Source Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: true,
        placeholder: "Select page to duplicate",
        dependsOn: "workspace"
      },
      { 
        name: "destination_type", 
        label: "Destination", 
        type: "select",
        required: true,
        options: [
          { value: "same_parent", label: "Same location as original" },
          { value: "database", label: "Different database" },
          { value: "page", label: "Child of different page" }
        ]
      },
      { 
        name: "destination_database_id", 
        label: "Destination Database", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_databases",
        required: false,
        placeholder: "Select destination database",
        dependsOn: { field: "destination_type", value: "database" }
      },
      { 
        name: "destination_page_id", 
        label: "Destination Page", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_pages",
        required: false,
        placeholder: "Select destination page",
        dependsOn: { field: "destination_type", value: "page" }
      },
      { 
        name: "title_suffix", 
        label: "Title Suffix", 
        type: "text",
        required: false,
        defaultValue: " (Copy)",
        placeholder: "Suffix to add to title"
      },
      { 
        name: "include_content", 
        label: "Include Content", 
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Copy all content blocks"
      },
      { 
        name: "include_children", 
        label: "Include Child Pages", 
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Also duplicate child pages"
      }
    ],
    outputSchema: [
      { name: "new_page_id", label: "New Page ID", type: "string" },
      { name: "url", label: "New Page URL", type: "string" },
      { name: "title", label: "New Page Title", type: "string" }
    ]
  },

  {
    type: "notion_action_sync_database_entries",
    title: "Sync Database Entries",
    description: "Sync database entries based on changes since last sync",
    icon: RefreshCw,
    providerId: "notion",
    requiredScopes: ["read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_workspaces",
        required: true,
        placeholder: "Select a workspace"
      },
      { 
        name: "database_id", 
        label: "Database", 
        type: "select",
        dynamic: true,
        dynamicOptions: "notion_databases",
        required: true,
        placeholder: "Select database to sync",
        dependsOn: "workspace"
      },
      { 
        name: "last_sync_time", 
        label: "Last Sync Time", 
        type: "datetime",
        required: false,
        placeholder: "ISO 8601 timestamp of last sync"
      },
      { 
        name: "filter_changed", 
        label: "Filter Changed Only", 
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Only return entries modified since last sync"
      }
    ],
    outputSchema: [
      { name: "added", label: "Added Entries", type: "array" },
      { name: "modified", label: "Modified Entries", type: "array" },
      { name: "deleted", label: "Deleted Entry IDs", type: "array" },
      { name: "sync_timestamp", label: "Sync Timestamp", type: "string" }
    ]
  }
]