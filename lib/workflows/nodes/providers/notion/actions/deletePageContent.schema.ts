import { NodeComponent } from "../../../types"

const NOTION_DELETE_PAGE_CONTENT_METADATA = {
  key: "notion_action_delete_page_content",
  name: "Delete Page Content Block",
  description: "Delete a specific content block from a page (moves to trash, can be recovered)"
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
      name: "blockId",
      label: "Block ID",
      type: "string",
      description: "The ID of the deleted block",
      example: "block_123abc"
    },
    {
      name: "archived",
      label: "Archived",
      type: "boolean",
      description: "Whether the block was successfully archived",
      example: true
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "When the block was deleted",
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
      name: "blockId",
      label: "Block ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.blockId}} or block_123abc",
      supportsAI: true,
      description: "The ID of the block to delete",
      tooltip: "Get block IDs from 'List Page Content' action. The block will be moved to trash and can be recovered."
    },
    {
      name: "deleteChildren",
      label: "Delete Child Blocks",
      type: "boolean",
      defaultValue: true,
      description: "Also delete any child blocks nested under this block",
      tooltip: "When enabled, deleting a toggle or column will also delete all blocks inside it."
    },
  ],
}
