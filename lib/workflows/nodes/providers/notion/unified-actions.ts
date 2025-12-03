import { FileText, Database, Users, Layers, MessageSquare, Box, Search } from "lucide-react"
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
        supportsVariables: true,
        hasConnectButton: true,
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


  // ============= UNIFIED COMMENT MANAGEMENT =============
  {
    type: "notion_action_manage_comments",
    title: "Manage Comments",
    description: "Create comments on pages/blocks or retrieve comments from discussions",
    icon: MessageSquare,
    providerId: "notion",
    requiredScopes: ["comment.read", "comment.write"],
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
          { value: "list", label: "List Comments" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      // For create operation - choose target
      {
        name: "commentTarget",
        label: "Comment On",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "page", label: "Page (new comment thread)" },
          { value: "block", label: "Block (new comment thread)" },
          { value: "discussion", label: "Discussion (reply to existing thread)" }
        ],
        placeholder: "Select where to add comment",
        description: "Choose whether to start a new comment thread or reply to an existing one",
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      // Page selection for page comments
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to comment on",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "create" },
            { field: "commentTarget", operator: "equals", value: "page" }
          ]
        }
      },
      // Block ID for block comments
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: true,
        placeholder: "Enter block ID (e.g., block_abc123...)",
        description: "The ID of the block to comment on. You can get this from the 'List Page Content' action.",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "create" },
            { field: "commentTarget", operator: "equals", value: "block" }
          ]
        }
      },
      // Discussion ID for thread replies
      {
        name: "discussionId",
        label: "Discussion ID",
        type: "text",
        required: true,
        placeholder: "Enter discussion ID (from previous comment)",
        description: "The ID of the discussion thread to reply to. Get this from a previous comment or the 'List Comments' action.",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "create" },
            { field: "commentTarget", operator: "equals", value: "discussion" }
          ]
        }
      },
      // Comment content for create
      {
        name: "commentText",
        label: "Comment Text",
        type: "textarea",
        required: true,
        placeholder: "Enter your comment...",
        rows: 5,
        description: "The text content of your comment",
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: { field: "operation", operator: "equals", value: "create" }
      },
      // For list operation - page or block selection
      {
        name: "listTarget",
        label: "List Comments From",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "page", label: "Page" },
          { value: "block", label: "Block" }
        ],
        placeholder: "Select source",
        visibilityCondition: { field: "operation", operator: "equals", value: "list" }
      },
      // Page selection for listing
      {
        name: "pageForList",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to retrieve comments from",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "list" },
            { field: "listTarget", operator: "equals", value: "page" }
          ]
        }
      },
      // Block ID for listing
      {
        name: "blockIdForList",
        label: "Block ID",
        type: "text",
        required: true,
        placeholder: "Enter block ID",
        description: "The ID of the block to retrieve comments from",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "list" },
            { field: "listTarget", operator: "equals", value: "block" }
          ]
        }
      },
      // Pagination limit
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of comments to return (max 100)",
        visibilityCondition: { field: "operation", operator: "equals", value: "list" }
      }
    ],
    outputSchema: [
      {
        name: "commentId",
        label: "Comment ID",
        type: "string",
        description: "The unique ID of the created comment (create operation)"
      },
      {
        name: "discussionId",
        label: "Discussion ID",
        type: "string",
        description: "The discussion thread ID (for replies)"
      },
      {
        name: "comments",
        label: "Comments",
        type: "array",
        description: "List of comments (list operation)"
      },
      {
        name: "hasMore",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more comments to load"
      },
      {
        name: "nextCursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for pagination"
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

  // ============= UNIFIED BLOCK MANAGEMENT =============
  {
    type: "notion_action_manage_blocks",
    title: "Manage Blocks",
    description: "Add blocks to pages, get blocks, retrieve block children, or get page with all children",
    icon: Box,
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
          { value: "add_block", label: "Add Block to Page" },
          { value: "get_block", label: "Get Block" },
          { value: "get_block_children", label: "Get Block Children" },
          { value: "get_page_with_children", label: "Get Page and Children" }
        ],
        placeholder: "Select operation",
        visibilityCondition: { field: "workspace", operator: "isNotEmpty" }
      },
      // Add Block fields
      {
        name: "targetPage",
        label: "Page",
        type: "select",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Select page to add block to",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "equals", value: "add_block" }
      },
      {
        name: "blockType",
        label: "Block Type",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "paragraph", label: "Paragraph" },
          { value: "heading_1", label: "Heading 1" },
          { value: "heading_2", label: "Heading 2" },
          { value: "heading_3", label: "Heading 3" },
          { value: "bulleted_list_item", label: "Bulleted List Item" },
          { value: "numbered_list_item", label: "Numbered List Item" },
          { value: "to_do", label: "To-Do" },
          { value: "toggle", label: "Toggle" },
          { value: "code", label: "Code Block" },
          { value: "quote", label: "Quote" },
          { value: "callout", label: "Callout" },
          { value: "divider", label: "Divider" }
        ],
        visibilityCondition: { field: "operation", operator: "equals", value: "add_block" }
      },
      {
        name: "blockContent",
        label: "Block Content",
        type: "textarea",
        required: false,
        placeholder: "Enter block content",
        description: "Text content for the block",
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "add_block" },
            { field: "blockType", operator: "in", value: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "callout", "code"] }
          ]
        }
      },
      {
        name: "checked",
        label: "Checked",
        type: "select",
        options: [
          { value: "true", label: "Checked" },
          { value: "false", label: "Unchecked" }
        ],
        defaultValue: "false",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "add_block" },
            { field: "blockType", operator: "equals", value: "to_do" }
          ]
        }
      },
      {
        name: "codeLanguage",
        label: "Programming Language",
        type: "select",
        options: [
          { value: "javascript", label: "JavaScript" },
          { value: "typescript", label: "TypeScript" },
          { value: "python", label: "Python" },
          { value: "java", label: "Java" },
          { value: "c", label: "C" },
          { value: "cpp", label: "C++" },
          { value: "csharp", label: "C#" },
          { value: "php", label: "PHP" },
          { value: "ruby", label: "Ruby" },
          { value: "go", label: "Go" },
          { value: "rust", label: "Rust" },
          { value: "sql", label: "SQL" },
          { value: "html", label: "HTML" },
          { value: "css", label: "CSS" },
          { value: "json", label: "JSON" },
          { value: "yaml", label: "YAML" },
          { value: "markdown", label: "Markdown" },
          { value: "bash", label: "Bash" },
          { value: "plain text", label: "Plain Text" }
        ],
        defaultValue: "plain text",
        visibilityCondition: {
          and: [
            { field: "operation", operator: "equals", value: "add_block" },
            { field: "blockType", operator: "equals", value: "code" }
          ]
        }
      },
      // Get Block fields
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: true,
        placeholder: "Enter block ID",
        description: "The ID of the block to retrieve",
        visibilityCondition: {
          or: [
            { field: "operation", operator: "equals", value: "get_block" },
            { field: "operation", operator: "equals", value: "get_block_children" }
          ]
        }
      },
      // Get Block Children fields
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of children to retrieve (max 100)",
        visibilityCondition: { field: "operation", operator: "equals", value: "get_block_children" }
      },
      // Get Page with Children fields
      {
        name: "pageForChildren",
        label: "Page",
        type: "select",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Select page",
        dependsOn: "workspace",
        visibilityCondition: { field: "operation", operator: "equals", value: "get_page_with_children" }
      },
      {
        name: "depth",
        label: "Depth",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "1", label: "Direct Children Only" },
          { value: "all", label: "All Descendants (Recursive)" }
        ],
        defaultValue: "1",
        description: "How deep to retrieve nested blocks",
        visibilityCondition: { field: "operation", operator: "equals", value: "get_page_with_children" }
      }
    ],
    outputSchema: [
      {
        name: "blockId",
        label: "Block ID",
        type: "string",
        description: "The ID of the block"
      },
      {
        name: "type",
        label: "Block Type",
        type: "string",
        description: "The type of block"
      },
      {
        name: "content",
        label: "Content",
        type: "object",
        description: "The block content"
      },
      {
        name: "children",
        label: "Children",
        type: "array",
        description: "Child blocks (for get_block_children and get_page_with_children operations)"
      },
      {
        name: "hasMore",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more children available"
      },
      {
        name: "nextCursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for pagination"
      }
    ]
  },

  // ============= ADVANCED QUERY =============
  {
    type: "notion_action_advanced_query",
    title: "Advanced Database Query",
    description: "Query databases with complex JSON filters, sorting, and pagination",
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
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database to query",
        dependsOn: "workspace"
      },
      {
        name: "filterMode",
        label: "Filter Mode",
        type: "select",
        required: true,
        clearable: false,
        options: [
          { value: "none", label: "No Filter (All Items)" },
          { value: "json", label: "JSON Filter (Advanced)" }
        ],
        defaultValue: "none",
        description: "How to filter the query results"
      },
      {
        name: "filterJson",
        label: "Filter JSON",
        type: "code",
        language: "json",
        required: false,
        placeholder: '{\n  "and": [\n    {\n      "property": "Status",\n      "status": {\n        "equals": "Done"\n      }\n    }\n  ]\n}',
        description: "Notion API filter object in JSON format",
        visibilityCondition: { field: "filterMode", operator: "equals", value: "json" }
      },
      {
        name: "sorts",
        label: "Sort Configuration (JSON)",
        type: "code",
        language: "json",
        required: false,
        placeholder: '[\n  {\n    "property": "Created",\n    "direction": "descending"\n  }\n]',
        description: "Array of sort objects (property name and direction)"
      },
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of results per page (max 100)"
      }
    ],
    outputSchema: [
      {
        name: "results",
        label: "Results",
        type: "array",
        description: "Array of database items matching the query"
      },
      {
        name: "hasMore",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more results available"
      },
      {
        name: "nextCursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for retrieving next page"
      },
      {
        name: "resultCount",
        label: "Result Count",
        type: "number",
        description: "Number of results returned"
      }
    ]
  },

  // Get Page Property
  {
    type: "notion_action_get_page_property",
    title: "Get Page Property",
    description: "Retrieve a specific property value from a Notion page",
    icon: FileText,
    isTrigger: false,
    providerId: "notion",
    testable: true,
    requiredScopes: ["content.read"],
    category: "Productivity",
    outputSchema: [
      {
        name: "propertyId",
        label: "Property ID",
        type: "string",
        description: "ID of the property"
      },
      {
        name: "propertyType",
        label: "Property Type",
        type: "string",
        description: "Type of the property (title, rich_text, number, etc.)"
      },
      {
        name: "value",
        label: "Property Value",
        type: "any",
        description: "The value of the property"
      },
      {
        name: "formattedValue",
        label: "Formatted Value",
        type: "string",
        description: "Human-readable formatted value"
      }
    ],
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page",
        type: "select",
        dynamic: "notion_pages",
        required: true,
        dependsOn: "workspace",
        placeholder: "Select page",
        description: "The page to retrieve the property from",
        supportsAI: true
      },
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: true,
        placeholder: "Enter property name (e.g., Status, Priority, Name)",
        description: "The name of the property to retrieve",
        supportsAI: true,
        tooltip: "Must match the exact property name in the page"
      }
    ]
  },

  // Update Database Schema
  {
    type: "notion_action_update_database_schema",
    title: "Update Database Schema",
    description: "Add, modify, or remove properties from a Notion database",
    icon: Database,
    isTrigger: false,
    providerId: "notion",
    testable: true,
    requiredScopes: ["content.write"],
    category: "Productivity",
    outputSchema: [
      {
        name: "databaseId",
        label: "Database ID",
        type: "string",
        description: "ID of the updated database"
      },
      {
        name: "url",
        label: "Database URL",
        type: "string",
        description: "URL of the database"
      },
      {
        name: "title",
        label: "Database Title",
        type: "string",
        description: "Title of the database"
      },
      {
        name: "properties",
        label: "Properties",
        type: "object",
        description: "All database properties after the update"
      },
      {
        name: "updatedProperty",
        label: "Updated Property",
        type: "string",
        description: "Name of the property that was added/modified/removed"
      }
    ],
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        dependsOn: "workspace",
        placeholder: "Select database",
        description: "The database to update",
        supportsAI: true
      },
      {
        name: "operation",
        label: "Operation",
        type: "select",
        required: true,
        options: [
          { value: "add_property", label: "Add Property" },
          { value: "remove_property", label: "Remove Property" }
        ],
        defaultValue: "add_property",
        description: "What to do with the property"
      },
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: true,
        placeholder: "Enter property name",
        description: "Name of the property to add/remove",
        supportsAI: true
      },
      {
        name: "propertyType",
        label: "Property Type",
        type: "select",
        required: true,
        options: [
          { value: "title", label: "Title" },
          { value: "rich_text", label: "Rich Text" },
          { value: "number", label: "Number" },
          { value: "select", label: "Select" },
          { value: "multi_select", label: "Multi-select" },
          { value: "date", label: "Date" },
          { value: "people", label: "People" },
          { value: "files", label: "Files" },
          { value: "checkbox", label: "Checkbox" },
          { value: "url", label: "URL" },
          { value: "email", label: "Email" },
          { value: "phone_number", label: "Phone Number" },
          { value: "formula", label: "Formula" },
          { value: "relation", label: "Relation" },
          { value: "rollup", label: "Rollup" },
          { value: "created_time", label: "Created Time" },
          { value: "created_by", label: "Created By" },
          { value: "last_edited_time", label: "Last Edited Time" },
          { value: "last_edited_by", label: "Last Edited By" }
        ],
        visibilityCondition: {
          field: "operation",
          operator: "equals",
          value: "add_property"
        },
        description: "Type of property to add"
      },
      {
        name: "selectOptions",
        label: "Select Options",
        type: "code",
        language: "json",
        required: false,
        placeholder: '[\n  {"name": "Option 1", "color": "blue"},\n  {"name": "Option 2", "color": "green"}\n]',
        description: "Options for select/multi-select properties",
        visibilityCondition: {
          or: [
            {
              and: [
                { field: "operation", operator: "equals", value: "add_property" },
                { field: "propertyType", operator: "equals", value: "select" }
              ]
            },
            {
              and: [
                { field: "operation", operator: "equals", value: "add_property" },
                { field: "propertyType", operator: "equals", value: "multi_select" }
              ]
            }
          ]
        },
        tooltip: "JSON array of options with name and color"
      }
    ]
  }
];