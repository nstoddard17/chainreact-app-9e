import { Database, Plus, Trash2, RotateCcw, FilePlus } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Granular Notion Database Actions
 * Each action is focused on a single database operation
 */

export const notionDatabaseActions: NodeComponent[] = [
  // ============= CREATE DATABASE =============
  {
    type: "notion_action_create_database",
    title: "Create Database",
    description: "Create a new database in Notion",
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
        placeholder: "Select Notion workspace",
        loadOnMount: true
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
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
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
        defaultValue: "Full page",
        description: "Full page databases are standalone, Inline databases are embedded in a page",
        dependsOn: "parentPage",
        hidden: {
          $deps: ["parentPage"],
          $condition: { parentPage: { $exists: false } }
        }
      },
      {
        name: "title",
        label: "Database Title",
        type: "text",
        required: true,
        placeholder: "Enter database title",
        dependsOn: "parentPage",
        hidden: {
          $deps: ["parentPage"],
          $condition: { parentPage: { $exists: false } }
        }
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Enter database description (optional)",
        dependsOn: "parentPage",
        hidden: {
          $deps: ["parentPage"],
          $condition: { parentPage: { $exists: false } }
        }
      },
      {
        name: "properties",
        label: "Database Properties",
        type: "custom",
        required: false,
        description: "Configure the database schema with properties like Status, Assignee, Due Date, etc.",
        tooltip: "Define the fields (properties) your database will have. Every database needs at least one Title property.",
        dependsOn: "parentPage",
        hidden: {
          $deps: ["parentPage"],
          $condition: { parentPage: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "database_id",
        label: "Database ID",
        type: "string",
        description: "The unique ID of the created database"
      },
      {
        name: "url",
        label: "Database URL",
        type: "string",
        description: "The URL to access the database"
      },
      {
        name: "title",
        label: "Database Title",
        type: "string",
        description: "The title of the database"
      },
      {
        name: "properties",
        label: "Properties",
        type: "object",
        description: "The database schema properties"
      }
    ]
  },

  // ============= UPDATE DATABASE INFO =============
  {
    type: "notion_action_update_database_info",
    title: "Update Database Info",
    description: "Update database title, description, or properties",
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
        dependsOn: "workspace",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "title",
        label: "Database Title",
        type: "text",
        required: false,
        placeholder: "Enter new title (optional)",
        description: "Leave empty to keep current title",
        dependsOn: "database",
        hidden: {
          $deps: ["database"],
          $condition: { database: { $exists: false } }
        }
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Enter new description (optional)",
        description: "Leave empty to keep current description",
        dependsOn: "database",
        hidden: {
          $deps: ["database"],
          $condition: { database: { $exists: false } }
        }
      },
      {
        name: "archived",
        label: "Archive Database",
        type: "select",
        required: false,
        clearable: false,
        options: [
          { value: "true", label: "Archive" },
          { value: "false", label: "Unarchive" }
        ],
        description: "Archive or unarchive the database",
        dependsOn: "database",
        hidden: {
          $deps: ["database"],
          $condition: { database: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "database_id",
        label: "Database ID",
        type: "string",
        description: "The unique ID of the database"
      },
      {
        name: "url",
        label: "Database URL",
        type: "string",
        description: "The URL of the database"
      },
      {
        name: "last_edited_time",
        label: "Last Edited Time",
        type: "string",
        description: "When the database was last edited"
      }
    ]
  },

  // NOTE: Query Database action removed - duplicate of Advanced Database Query (notion_action_advanced_query)

  // ============= FIND OR CREATE DATABASE ITEM =============
  {
    type: "notion_action_find_or_create_item",
    title: "Find or Create Database Item",
    description: "Search for a database item by property value, create if not found",
    icon: FilePlus,
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
        placeholder: "Select Notion workspace"
      },
      {
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database to search/create in",
        description: "The database to search for the item in, or create it if not found",
        dependsOn: "workspace"
      },
      {
        name: "searchProperty",
        label: "Search By Property",
        type: "select",
        dynamic: "notion_database_properties",
        required: true,
        placeholder: "Select property to search by",
        description: "The property to use when searching for existing items (e.g., Title, Email, ID)",
        dependsOn: "database"
      },
      {
        name: "searchValue",
        label: "Search Value",
        type: "text",
        required: true,
        placeholder: "Enter value to search for",
        description: "The value to match against the search property",
        supportsVariables: true,
        hasConnectButton: true
      },
      {
        name: "createIfNotFound",
        label: "Create If Not Found",
        type: "select",
        required: true,
        clearable: false,
        defaultValue: "true",
        options: [
          { value: "true", label: "Yes, create new item" },
          { value: "false", label: "No, just search" }
        ],
        description: "Whether to create a new item if no match is found"
      },
      {
        name: "createProperties",
        label: "Properties for New Item",
        type: "dynamic_fields",
        dynamic: "notion_database_properties",
        dependsOn: "database",
        required: false,
        placeholder: "Loading database properties...",
        description: "Properties to set if creating a new item (the search property/value will be included automatically)",
        visibilityCondition: { field: "createIfNotFound", operator: "equals", value: "true" }
      }
    ],
    outputSchema: [
      {
        name: "found",
        label: "Item Was Found",
        type: "boolean",
        description: "Whether an existing item was found"
      },
      {
        name: "created",
        label: "Item Was Created",
        type: "boolean",
        description: "Whether a new item was created"
      },
      {
        name: "page_id",
        label: "Page ID",
        type: "string",
        description: "The ID of the found or created page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the found or created page"
      },
      {
        name: "properties",
        label: "Properties",
        type: "object",
        description: "The properties of the found or created item"
      },
      {
        name: "item",
        label: "Full Item",
        type: "object",
        description: "Complete item object"
      }
    ]
  },

  // ============= ARCHIVE DATABASE ITEM =============
  {
    type: "notion_action_archive_database_item",
    title: "Archive Database Item",
    description: "Archive a database item (soft delete)",
    icon: Trash2,
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
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database",
        description: "The database containing the item to archive",
        dependsOn: "workspace"
      },
      {
        name: "itemToArchive",
        label: "Item to Archive",
        type: "select",
        dynamic: "notion_database_items",
        required: true,
        placeholder: "Select item to archive",
        description: "The database item to archive",
        dependsOn: "database"
      }
    ],
    outputSchema: [
      {
        name: "page_id",
        label: "Page ID",
        type: "string",
        description: "The ID of the archived page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the archived page"
      },
      {
        name: "archived",
        label: "Archived",
        type: "boolean",
        description: "Whether the item is archived (will be true)"
      },
      {
        name: "archived_time",
        label: "Archived Time",
        type: "string",
        description: "When the item was archived"
      },
      {
        name: "properties",
        label: "Properties",
        type: "object",
        description: "The properties of the archived item"
      }
    ]
  },

  // ============= RESTORE DATABASE ITEM =============
  {
    type: "notion_action_restore_database_item",
    title: "Restore Database Item",
    description: "Restore an archived database item",
    icon: RotateCcw,
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
        name: "database",
        label: "Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select database",
        description: "The database containing the archived item",
        dependsOn: "workspace"
      },
      {
        name: "itemToRestore",
        label: "Item to Restore",
        type: "select",
        dynamic: "notion_archived_items",
        required: true,
        placeholder: "Select archived item to restore",
        description: "The archived database item to restore",
        dependsOn: "database"
      }
    ],
    outputSchema: [
      {
        name: "page_id",
        label: "Page ID",
        type: "string",
        description: "The ID of the restored page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the restored page"
      },
      {
        name: "archived",
        label: "Archived",
        type: "boolean",
        description: "Whether the item is archived (will be false)"
      },
      {
        name: "restored_time",
        label: "Restored Time",
        type: "string",
        description: "When the item was restored"
      },
      {
        name: "properties",
        label: "Properties",
        type: "object",
        description: "The properties of the restored item"
      }
    ]
  }
]