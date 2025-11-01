import { NodeComponent } from "../../../types"

const NOTION_UPDATE_PAGE_CONTENT_METADATA = {
  key: "notion_action_update_page_content",
  name: "Update Page Content Block",
  description: "Update a specific content block on a page (text, toggle, callout, etc.)"
}

export const updatePageContentActionSchema: NodeComponent = {
  type: NOTION_UPDATE_PAGE_CONTENT_METADATA.key,
  title: "Update Page Content Block",
  description: NOTION_UPDATE_PAGE_CONTENT_METADATA.description,
  icon: "Edit" as any, // Will be resolved in index file
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
      description: "The ID of the updated block",
      example: "block_123abc"
    },
    {
      name: "type",
      label: "Block Type",
      type: "string",
      description: "The type of the block",
      example: "paragraph"
    },
    {
      name: "content",
      label: "Updated Content",
      type: "object",
      description: "The updated content of the block",
      example: { text: "Updated text" }
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the update was successful",
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
      description: "The ID of the block to update",
      tooltip: "Get block IDs from 'List Page Content' action or from triggers."
    },
    {
      name: "newContent",
      label: "New Content",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: "Enter new content...",
      description: "The new content for this block. Formatting depends on block type.",
      tooltip: "Note: You cannot change the block type, only update its content. To change type, delete the block and create a new one."
    },
    {
      name: "color",
      label: "Text Color (Optional)",
      type: "select",
      required: false,
      options: [
        { value: "default", label: "Default" },
        { value: "gray", label: "Gray" },
        { value: "brown", label: "Brown" },
        { value: "orange", label: "Orange" },
        { value: "yellow", label: "Yellow" },
        { value: "green", label: "Green" },
        { value: "blue", label: "Blue" },
        { value: "purple", label: "Purple" },
        { value: "pink", label: "Pink" },
        { value: "red", label: "Red" },
        { value: "gray_background", label: "Gray Background" },
        { value: "brown_background", label: "Brown Background" },
        { value: "orange_background", label: "Orange Background" },
        { value: "yellow_background", label: "Yellow Background" },
        { value: "green_background", label: "Green Background" },
        { value: "blue_background", label: "Blue Background" },
        { value: "purple_background", label: "Purple Background" },
        { value: "pink_background", label: "Pink Background" },
        { value: "red_background", label: "Red Background" }
      ],
      defaultValue: "default",
      description: "Color for the text or background"
    },
  ],
}
