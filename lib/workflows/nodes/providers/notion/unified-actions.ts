import { FileText, Database, Search, Users, MessageSquare, Layers, Plus } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Unified Notion Actions - Consolidated version combining multiple related actions
 * Each action has an operation dropdown to select specific operations
 */

export const notionUnifiedActions: NodeComponent[] = [
  // ============= SIMPLE CREATE PAGE (for backwards compatibility with templates) =============
  {
    type: "notion_action_create_page",
    title: "Create Page",
    description: "Create a new page in Notion workspace",
    icon: Plus,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "databaseId",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database",
        loadOnMount: true,
        tooltip: "Select the Notion database where the page will be created"
      },
      {
        name: "title",
        label: "Page Title",
        type: "text",
        required: true,
        placeholder: "Enter page title"
      },
      {
        name: "content",
        label: "Page Content",
        type: "rich-text",
        required: false,
        placeholder: "Enter page content"
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
      }
    ]
  },
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
        rows: 15,  // Increased for more content
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
        name: "filterType",
        label: "Filter Type",
        type: "select",
        required: false,
        clearable: true,
        options: [
          { value: "title_contains", label: "Title Contains" },
          { value: "title_equals", label: "Title Equals" },
          { value: "title_starts_with", label: "Title Starts With" },
          { value: "title_ends_with", label: "Title Ends With" },
          { value: "created_after", label: "Created After" },
          { value: "created_before", label: "Created Before" },
          { value: "updated_after", label: "Last Edited After" },
          { value: "updated_before", label: "Last Edited Before" },
          { value: "property_equals", label: "Property Equals" },
          { value: "property_contains", label: "Property Contains" },
          { value: "property_checkbox", label: "Checkbox Property" },
          { value: "property_select", label: "Select Property" },
          { value: "property_multi_select", label: "Multi-Select Property" },
          { value: "property_number", label: "Number Property" },
          { value: "property_date", label: "Date Property" },
          { value: "property_people", label: "People Property" },
          { value: "custom_json", label: "Custom JSON Filter" }
        ],
        placeholder: "Select filter type",
        visibilityCondition: { field: "operation", operator: "equals", value: "query" }
      },
      // Title filter fields
      {
        name: "titleFilterValue",
        label: "Title Value",
        type: "text",
        required: false,
        placeholder: "Enter title to search for",
        visibilityCondition: {
          field: "filterType",
          operator: "in",
          value: ["title_contains", "title_equals", "title_starts_with", "title_ends_with"]
        }
      },
      // Date filter fields
      {
        name: "dateFilterValue",
        label: "Date",
        type: "date",
        required: false,
        placeholder: "Select date",
        visibilityCondition: {
          field: "filterType",
          operator: "in",
          value: ["created_after", "created_before", "updated_after", "updated_before"]
        }
      },
      // Property filter fields
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: false,
        placeholder: "Enter property name",
        visibilityCondition: {
          field: "filterType",
          operator: "in",
          value: ["property_equals", "property_contains", "property_checkbox", "property_select",
                  "property_multi_select", "property_number", "property_date", "property_people"]
        }
      },
      {
        name: "propertyValue",
        label: "Property Value",
        type: "text",
        required: false,
        placeholder: "Enter property value",
        visibilityCondition: {
          field: "filterType",
          operator: "in",
          value: ["property_equals", "property_contains", "property_select"]
        }
      },
      {
        name: "propertyCheckboxValue",
        label: "Checkbox Value",
        type: "select",
        required: false,
        options: [
          { value: "true", label: "Checked" },
          { value: "false", label: "Unchecked" }
        ],
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_checkbox"
        }
      },
      {
        name: "propertyMultiSelectValues",
        label: "Select Values",
        type: "tag-input",
        required: false,
        placeholder: "Enter values (press Enter after each)",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_multi_select"
        }
      },
      {
        name: "propertyNumberValue",
        label: "Number Value",
        type: "number",
        required: false,
        placeholder: "Enter number",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_number"
        }
      },
      {
        name: "propertyNumberOperator",
        label: "Number Operator",
        type: "select",
        required: false,
        options: [
          { value: "equals", label: "Equals" },
          { value: "does_not_equal", label: "Does Not Equal" },
          { value: "greater_than", label: "Greater Than" },
          { value: "less_than", label: "Less Than" },
          { value: "greater_than_or_equal_to", label: "Greater Than or Equal" },
          { value: "less_than_or_equal_to", label: "Less Than or Equal" }
        ],
        defaultValue: "equals",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_number"
        }
      },
      {
        name: "propertyDateValue",
        label: "Date Value",
        type: "date",
        required: false,
        placeholder: "Select date",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_date"
        }
      },
      {
        name: "propertyDateOperator",
        label: "Date Operator",
        type: "select",
        required: false,
        options: [
          { value: "equals", label: "On" },
          { value: "before", label: "Before" },
          { value: "after", label: "After" },
          { value: "on_or_before", label: "On or Before" },
          { value: "on_or_after", label: "On or After" },
          { value: "past_week", label: "Past Week" },
          { value: "past_month", label: "Past Month" },
          { value: "past_year", label: "Past Year" },
          { value: "next_week", label: "Next Week" },
          { value: "next_month", label: "Next Month" },
          { value: "next_year", label: "Next Year" }
        ],
        defaultValue: "equals",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_date"
        }
      },
      {
        name: "propertyPeopleValue",
        label: "Person Email",
        type: "text",
        required: false,
        placeholder: "Enter email address",
        visibilityCondition: {
          field: "filterType",
          operator: "equals",
          value: "property_people"
        }
      },
      // Custom JSON filter
      {
        name: "customFilter",
        label: "Custom Filter (JSON)",
        type: "json",
        required: false,
        placeholder: "Enter custom filter conditions in Notion API format",
        visibilityCondition: { field: "filterType", operator: "equals", value: "custom_json" }
      },
      // Sort fields
      {
        name: "sortBy",
        label: "Sort By",
        type: "select",
        required: false,
        clearable: true,
        options: [
          { value: "created_time", label: "Created Time" },
          { value: "last_edited_time", label: "Last Edited Time" },
          { value: "title", label: "Title" }
        ],
        placeholder: "Select sort field",
        visibilityCondition: { field: "operation", operator: "equals", value: "query" }
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
        defaultValue: "ascending",
        visibilityCondition: {
          field: "sortBy",
          operator: "isNotEmpty"
        }
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Maximum number of results (default: 100)",
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