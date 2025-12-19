import { NodeComponent } from "../../../types"

const NOTION_APPEND_PAGE_CONTENT_METADATA = {
  key: "notion_action_append_page_content",
  name: "Append Page Content",
  description: "Add new content blocks to the end of a Notion page"
}

export const appendPageContentActionSchema: NodeComponent = {
  type: NOTION_APPEND_PAGE_CONTENT_METADATA.key,
  title: "Append Page Content",
  description: NOTION_APPEND_PAGE_CONTENT_METADATA.description,
  icon: "FilePlus" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.write"],
  category: "Productivity",
  outputSchema: [
    {
      name: "blocks",
      label: "Created Blocks",
      type: "array",
      description: "The blocks that were appended to the page",
      example: [{ id: "block_123", type: "paragraph" }]
    },
    {
      name: "pageId",
      label: "Page ID",
      type: "string",
      description: "The ID of the page that was updated",
      example: "page_123"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the content was appended successfully",
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
      name: "pageId",
      label: "Page",
      type: "combobox",
      dynamic: "notion_pages",
      required: true,
      dependsOn: "workspace",
      searchable: true,
      placeholder: "Search for a page...",
      description: "The page to append content to",
      loadingText: "Loading pages..."
    },
    {
      name: "content",
      label: "Content to Append",
      type: "textarea",
      required: true,
      rows: 15,
      placeholder: "Enter content with markdown-like formatting...",
      description: "Formatting: # H1 | ## H2 | ### H3 | - bullet | 1. numbered | [] todo | [x] done | > quote | --- divider | ``` code",
      helpText: `Supported formatting:
• Headers: # H1, ## H2, ### H3
• Lists: - bullet, 1. numbered list
• Todos: [] unchecked, [x] checked
• Quotes: > quoted text
• Code: \`\`\` code block
• Divider: --- or ***`,
      supportsVariables: true,
      hasConnectButton: true
    },
    {
      name: "appendAfterBlock",
      label: "Append After Specific Block (Optional)",
      type: "text",
      required: false,
      placeholder: "block_123abc",
      supportsAI: true,
      description: "Block ID to append after. Leave empty to append at the end of the page.",
      tooltip: "Get block IDs from 'List Page Content' action. If specified, content will be inserted after this block instead of at the end."
    },
  ],
}
