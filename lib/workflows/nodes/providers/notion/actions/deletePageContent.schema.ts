import { NodeComponent } from "../../../types"

const NOTION_DELETE_PAGE_CONTENT_METADATA = {
  key: "notion_action_delete_page_content",
  name: "Delete Page Content Block",
  description: "Delete content blocks from a page (moves to trash, can be recovered)"
}

export const deletePageContentActionSchema: NodeComponent = {
  type: NOTION_DELETE_PAGE_CONTENT_METADATA.key,
  title: "Delete Page Content Block",
  description: NOTION_DELETE_PAGE_CONTENT_METADATA.description,
  icon: "Trash2" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.write"],
  category: "Productivity",
  outputSchema: [
    {
      name: "blockIds",
      label: "Block IDs",
      type: "array",
      description: "The IDs of the deleted blocks",
      example: ["block_123abc", "block_456def"]
    },
    {
      name: "deletedCount",
      label: "Deleted Count",
      type: "number",
      description: "Number of blocks deleted",
      example: 2
    },
    {
      name: "archived",
      label: "Archived",
      type: "boolean",
      description: "Whether the blocks were successfully archived",
      example: true
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "When the blocks were deleted",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the deletion was successful",
      example: true
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
      name: "selectionMode",
      label: "Block Selection Method",
      type: "select",
      required: true,
      options: [
        { value: "fromPage", label: "Select from page (recommended)" },
        { value: "manual", label: "Enter block ID manually" }
      ],
      defaultValue: "fromPage",
      description: "Choose how to select blocks to delete",
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
      description: "The ID of the block to delete",
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
      description: "Select the page containing blocks to delete",
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
    // Block selection from page - shows blocks with checkboxes
    {
      name: "blocksToDelete",
      label: "Blocks to Delete",
      type: "dynamic_fields",
      dynamic: "notion_page_blocks_deletable",
      dependsOn: "page",
      required: false,
      placeholder: "Loading page blocks...",
      description: "Select the blocks you want to delete. Deleted blocks are moved to trash and can be recovered.",
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
      name: "deleteChildren",
      label: "Delete Child Blocks",
      type: "boolean",
      defaultValue: true,
      description: "Also delete any child blocks nested under selected blocks",
      tooltip: "When enabled, deleting a toggle or column will also delete all blocks inside it.",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
  ],
}
