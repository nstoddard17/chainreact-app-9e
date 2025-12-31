import { Box, Plus, FileText, List } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Granular Notion Block Actions
 * Each action is focused on a single block operation
 */

export const notionBlockActions: NodeComponent[] = [
  // ============= ADD BLOCK =============
  {
    type: "notion_action_add_block",
    title: "Add Block to Page",
    description: "Add a new content block to a Notion page",
    icon: Plus,
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
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to add the block to",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
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
        placeholder: "Select block type",
        description: "The type of block to create",
        dependsOn: "page",
        hidden: {
          $deps: ["page"],
          $condition: { page: { $exists: false } }
        }
      },
      {
        name: "blockContent",
        label: "Block Content",
        type: "textarea",
        required: false,
        placeholder: "Enter block content",
        description: "Text content for the block",
        rows: 5,
        supportsVariables: true,
        hasConnectButton: true,
        visibilityCondition: {
          field: "blockType",
          operator: "in",
          value: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "callout", "code"]
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
        clearable: false,
        description: "Whether the to-do item is checked",
        visibilityCondition: {
          field: "blockType",
          operator: "equals",
          value: "to_do"
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
        clearable: false,
        description: "Syntax highlighting language for code blocks",
        visibilityCondition: {
          field: "blockType",
          operator: "equals",
          value: "code"
        }
      }
    ],
    outputSchema: [
      {
        name: "block_id",
        label: "Block ID",
        type: "string",
        description: "The unique ID of the created block"
      },
      {
        name: "type",
        label: "Block Type",
        type: "string",
        description: "The type of block that was created"
      },
      {
        name: "created_time",
        label: "Created Time",
        type: "string",
        description: "When the block was created"
      },
      {
        name: "content",
        label: "Content",
        type: "object",
        description: "The block content"
      }
    ]
  },

  // ============= GET BLOCK =============
  {
    type: "notion_action_get_block",
    title: "Get Block",
    description: "Retrieve a specific block by its ID",
    icon: Box,
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
        name: "selectionMode",
        label: "Block Selection Method",
        type: "select",
        required: true,
        options: [
          { value: "fromPage", label: "Select from page (recommended)" },
          { value: "manual", label: "Enter block ID manually" }
        ],
        defaultValue: "fromPage",
        description: "Choose how to select the block to retrieve",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      // Manual mode - direct block ID input
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: false,
        placeholder: "{{trigger.blockId}} or block_123abc",
        supportsAI: true,
        description: "The ID of the block to retrieve",
        tooltip: "Get block IDs from 'List Page Content' action or from triggers.",
        hidden: {
          $deps: ["selectionMode", "workspace"],
          $condition: {
            $or: [
              { workspace: { $exists: false } },
              { selectionMode: { $ne: "manual" } }
            ]
          }
        }
      },
      // Page selection mode - select page first
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: false,
        placeholder: "Search for a page...",
        description: "Select the page containing the block",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["selectionMode", "workspace"],
          $condition: {
            $or: [
              { workspace: { $exists: false } },
              { selectionMode: { $ne: "fromPage" } }
            ]
          }
        }
      },
      // Block selection from page
      {
        name: "selectedBlock",
        label: "Block to Retrieve",
        type: "select",
        dynamic: "notion_page_blocks_selectable",
        dependsOn: "page",
        required: false,
        placeholder: "Select a block...",
        description: "Select the block you want to retrieve",
        hidden: {
          $deps: ["page", "selectionMode"],
          $condition: {
            $or: [
              { page: { $exists: false } },
              { selectionMode: { $ne: "fromPage" } }
            ]
          }
        }
      }
    ],
    outputSchema: [
      {
        name: "block_id",
        label: "Block ID",
        type: "string",
        description: "The unique ID of the block"
      },
      {
        name: "type",
        label: "Block Type",
        type: "string",
        description: "The type of block"
      },
      {
        name: "has_children",
        label: "Has Children",
        type: "boolean",
        description: "Whether the block has child blocks"
      },
      {
        name: "created_time",
        label: "Created Time",
        type: "string",
        description: "When the block was created"
      },
      {
        name: "last_edited_time",
        label: "Last Edited Time",
        type: "string",
        description: "When the block was last edited"
      },
      {
        name: "content",
        label: "Content",
        type: "object",
        description: "The block content"
      }
    ]
  },

  // ============= GET BLOCK CHILDREN =============
  {
    type: "notion_action_get_block_children",
    title: "Get Block Children",
    description: "Retrieve all child blocks of a parent block",
    icon: List,
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
        name: "selectionMode",
        label: "Block Selection Method",
        type: "select",
        required: true,
        options: [
          { value: "fromPage", label: "Select from page (recommended)" },
          { value: "manual", label: "Enter block ID manually" }
        ],
        defaultValue: "fromPage",
        description: "Choose how to select the parent block",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      // Manual mode - direct block ID input
      {
        name: "blockId",
        label: "Block ID",
        type: "text",
        required: false,
        placeholder: "{{trigger.blockId}} or block_123abc",
        supportsAI: true,
        description: "The ID of the parent block whose children to retrieve",
        tooltip: "Get block IDs from 'List Page Content' action or from triggers.",
        hidden: {
          $deps: ["selectionMode", "workspace"],
          $condition: {
            $or: [
              { workspace: { $exists: false } },
              { selectionMode: { $ne: "manual" } }
            ]
          }
        }
      },
      // Page selection mode - select page first
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: false,
        placeholder: "Search for a page...",
        description: "Select the page containing the parent block",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["selectionMode", "workspace"],
          $condition: {
            $or: [
              { workspace: { $exists: false } },
              { selectionMode: { $ne: "fromPage" } }
            ]
          }
        }
      },
      // Block selection from page
      {
        name: "selectedBlock",
        label: "Parent Block",
        type: "select",
        dynamic: "notion_page_blocks_selectable",
        dependsOn: "page",
        required: false,
        placeholder: "Select a parent block...",
        description: "Select the block whose children you want to retrieve",
        hidden: {
          $deps: ["page", "selectionMode"],
          $condition: {
            $or: [
              { page: { $exists: false } },
              { selectionMode: { $ne: "fromPage" } }
            ]
          }
        }
      },
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of children to retrieve (max 100)",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "startCursor",
        label: "Start Cursor (Pagination)",
        type: "text",
        required: false,
        placeholder: "Enter cursor from previous query",
        description: "For pagination - use next_cursor from previous query",
        supportsVariables: true,
        hasConnectButton: true,
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "children",
        label: "Children",
        type: "array",
        description: "Array of child blocks"
      },
      {
        name: "has_more",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more children available"
      },
      {
        name: "next_cursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for retrieving next page"
      },
      {
        name: "total_count",
        label: "Total Count",
        type: "number",
        description: "Number of children returned in this page"
      }
    ]
  },

  // ============= GET PAGE WITH CHILDREN =============
  {
    type: "notion_action_get_page_with_children",
    title: "Get Page and Children",
    description: "Retrieve a page along with all its content blocks",
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
        loadOnMount: true
      },
      {
        name: "page",
        label: "Page",
        type: "combobox",
        dynamic: "notion_pages",
        required: true,
        placeholder: "Search for a page...",
        description: "The page to retrieve with its children",
        dependsOn: "workspace",
        searchable: true,
        loadingText: "Loading pages...",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
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
        dependsOn: "page",
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
        name: "title",
        label: "Page Title",
        type: "string",
        description: "The title of the page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The URL of the page"
      },
      {
        name: "children",
        label: "Children",
        type: "array",
        description: "All child blocks of the page"
      },
      {
        name: "total_blocks",
        label: "Total Blocks",
        type: "number",
        description: "Total number of blocks retrieved"
      },
      {
        name: "page",
        label: "Full Page Object",
        type: "object",
        description: "Complete page object with all details"
      }
    ]
  }
]
