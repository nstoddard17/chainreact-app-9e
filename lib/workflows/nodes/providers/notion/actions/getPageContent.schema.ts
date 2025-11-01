import { NodeComponent } from "../../../types"

const NOTION_GET_PAGE_CONTENT_METADATA = {
  key: "notion_action_get_page_content",
  name: "Get Page Content Block",
  description: "Get details of a specific content block on a page"
}

export const getPageContentActionSchema: NodeComponent = {
  type: NOTION_GET_PAGE_CONTENT_METADATA.key,
  title: "Get Page Content Block",
  description: NOTION_GET_PAGE_CONTENT_METADATA.description,
  icon: "FileText" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.read"],
  category: "Productivity",
  outputSchema: [
    {
      name: "blockId",
      label: "Block ID",
      type: "string",
      description: "The unique ID of the block",
      example: "block_123abc"
    },
    {
      name: "type",
      label: "Block Type",
      type: "string",
      description: "The type of block (paragraph, heading, etc.)",
      example: "paragraph"
    },
    {
      name: "content",
      label: "Content",
      type: "object",
      description: "The block's content and properties",
      example: { text: "Hello world", color: "default" }
    },
    {
      name: "hasChildren",
      label: "Has Children",
      type: "boolean",
      description: "Whether this block has child blocks",
      example: false
    },
    {
      name: "createdTime",
      label: "Created Time",
      type: "string",
      description: "When the block was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "lastEditedTime",
      label: "Last Edited Time",
      type: "string",
      description: "When the block was last edited",
      example: "2024-01-15T10:30:00Z"
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
      description: "The ID of the block to retrieve. Use variables from previous steps or enter directly.",
      tooltip: "Get block IDs from the 'List Page Content' action or from a trigger."
    },
    {
      name: "includeChildren",
      label: "Include Child Blocks",
      type: "boolean",
      defaultValue: false,
      description: "Also retrieve any child blocks nested under this block"
    },
  ],
}
