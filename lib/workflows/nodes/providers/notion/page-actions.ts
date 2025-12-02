import { FileText, FilePlus, FileEdit, FileStack, Archive, Copy } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Separate Notion Page Actions
 * Each page operation is now its own distinct action with tailored fields
 */

export const notionPageActions: NodeComponent[] = [
  // ============= CREATE PAGE =============
  {
    type: "notion_action_create_page",
    title: "Create Page",
    description: "Create a new page in a Notion database or under another page",
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
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
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "parentDatabase",
        label: "Select Database",
        type: "select",
        dynamic: "notion_databases",
        required: true,
        placeholder: "Select the database to create the page in",
        description: "The page will be created as an entry in this database",
        dependsOn: "workspace",
        hidden: {
          $deps: ["parentType"],
          $condition: {
            $or: [
              { parentType: { $exists: false } },
              { parentType: { $ne: "database" } }
            ]
          }
        }
      },
      {
        name: "parentPage",
        label: "Parent Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a parent page...",
        description: "The page will be created as a child of this page",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["parentType"],
          $condition: {
            $or: [
              { parentType: { $exists: false } },
              { parentType: { $ne: "page" } }
            ]
          }
        }
      },
      {
        name: "title",
        label: "Page Title",
        type: "text",
        required: true,
        placeholder: "Enter page title",
        hidden: {
          $deps: ["parentType"],
          $condition: { parentType: { $exists: false } }
        }
      },
      {
        name: "content",
        label: "Content",
        type: "textarea",
        required: false,
        placeholder: "Enter content with markdown-like formatting...",
        rows: 15,
        description: "Formatting: # H1 | ## H2 | ### H3 | - bullet | 1. numbered | [] todo | [x] done | > quote | --- divider | ``` code",
        helpText: `Supported formatting:
• Headers: # H1, ## H2, ### H3
• Lists: - bullet, 1. numbered list
• Todos: [] unchecked, [x] checked
• Quotes: > quoted text
• Code: \`\`\` code block
• Divider: --- or ***`,
        hidden: {
          $deps: ["parentType"],
          $condition: { parentType: { $exists: false } }
        }
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
        description: "The URL of the created page"
      },
      {
        name: "created_time",
        label: "Created Time",
        type: "string",
        description: "When the page was created"
      },
      {
        name: "last_edited_time",
        label: "Last Edited Time",
        type: "string",
        description: "When the page was last edited"
      }
    ]
  },

  // ============= UPDATE PAGE =============
  {
    type: "notion_action_update_page",
    title: "Update Page",
    description: "Update properties and content blocks of an existing Notion page",
    icon: FileEdit,
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        loadOnMount: true,
        placeholder: "Search for a page...",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "pageFields",
        label: "Page Properties & Blocks",
        type: "dynamic_fields",
        dynamic: "notion_page_blocks",
        dependsOn: "page",
        required: false,
        placeholder: "Loading page properties and blocks...",
        description: "Edit page properties and content blocks. Individual blocks are updated in place, preserving their history and metadata.",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
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
        name: "last_edited_time",
        label: "Last Edited Time",
        type: "string",
        description: "When the page was last edited"
      },
      {
        name: "blocks_updated",
        label: "Blocks Updated",
        type: "number",
        description: "Number of blocks updated"
      },
      {
        name: "blocks_added",
        label: "Blocks Added",
        type: "number",
        description: "Number of blocks added"
      }
    ]
  },

  // ============= APPEND TO PAGE =============
  {
    type: "notion_action_append_to_page",
    title: "Append to Page",
    description: "Add content blocks to the end of an existing Notion page",
    icon: FileStack,
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        loadOnMount: true,
        placeholder: "Search for a page...",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "content",
        label: "Content",
        type: "textarea",
        required: true,
        placeholder: "Enter content with markdown-like formatting...",
        rows: 15,
        description: "Formatting: # H1 | ## H2 | ### H3 | - bullet | 1. numbered | [] todo | [x] done | > quote | --- divider | ``` code",
        helpText: `Supported formatting:
• Headers: # H1, ## H2, ### H3
• Lists: - bullet, 1. numbered list
• Todos: [] unchecked, [x] checked
• Quotes: > quoted text
• Code: \`\`\` code block
• Divider: --- or ***`,
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "page_id",
        label: "Page ID",
        type: "string",
        description: "The ID of the page where blocks were appended"
      },
      {
        name: "blocks",
        label: "Appended Blocks",
        type: "array",
        description: "The blocks that were added to the page"
      }
    ]
  },

  // ============= GET PAGE DETAILS =============
  {
    type: "notion_action_get_page_details",
    title: "Get Page Details",
    description: "Retrieve properties and content of a Notion page",
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        loadOnMount: true,
        placeholder: "Search for a page...",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "includeProperties",
        label: "Include Properties",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" }
        ],
        description: "Include page properties in the output",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      },
      {
        name: "includeContent",
        label: "Include Content",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" }
        ],
        description: "Include page content blocks in the output",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "page_id",
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
        type: "array",
        description: "The content blocks of the page"
      },
      {
        name: "created_time",
        label: "Created Time",
        type: "string",
        description: "When the page was created"
      },
      {
        name: "last_edited_time",
        label: "Last Edited Time",
        type: "string",
        description: "When the page was last edited"
      },
      {
        name: "archived",
        label: "Archived",
        type: "boolean",
        description: "Whether the page is archived"
      }
    ]
  },

  // ============= ARCHIVE/UNARCHIVE PAGE =============
  {
    type: "notion_action_archive_page",
    title: "Archive/Unarchive Page",
    description: "Archive or restore a Notion page",
    icon: Archive,
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        loadOnMount: true,
        placeholder: "Search for a page...",
        description: "Only pages shared with your Notion integration will appear",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "archiveAction",
        label: "Action",
        type: "select",
        required: true,
        clearable: false,
        defaultValue: "archive",
        options: [
          { value: "archive", label: "Archive Page" },
          { value: "unarchive", label: "Unarchive Page" }
        ],
        description: "Choose whether to archive or restore the page",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "page_id",
        label: "Page ID",
        type: "string",
        description: "The ID of the page"
      },
      {
        name: "archived",
        label: "Archived",
        type: "boolean",
        description: "Current archived status of the page"
      }
    ]
  },

  // ============= DUPLICATE PAGE =============
  {
    type: "notion_action_duplicate_page",
    title: "Duplicate Page",
    description: "Create a copy of an existing Notion page",
    icon: Copy,
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
        loadOnMount: true,
        placeholder: "Select Notion workspace"
      },
      {
        name: "page",
        label: "Page to Duplicate",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "Select the page you want to duplicate",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "destinationPage",
        label: "Destination Parent Page (Optional)",
        type: "combobox",
        dynamic: "notion_pages",
        required: false,
        placeholder: "Select destination parent page (leave empty for same location)",
        description: "Where to create the duplicate. If empty, creates in the same location as the original",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      },
      {
        name: "titleSuffix",
        label: "Title Suffix",
        type: "text",
        required: false,
        defaultValue: " (Copy)",
        placeholder: "Enter suffix to add to title",
        description: "Text to add to the duplicate's title (e.g., ' (Copy)')",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "new_page_id",
        label: "New Page ID",
        type: "string",
        description: "The ID of the duplicated page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the duplicated page"
      },
      {
        name: "title",
        label: "Page Title",
        type: "string",
        description: "The title of the duplicated page"
      }
    ]
  }
]
