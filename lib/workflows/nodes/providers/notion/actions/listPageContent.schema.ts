import { NodeComponent } from "../../../types"

const NOTION_LIST_PAGE_CONTENT_METADATA = {
  key: "notion_action_list_page_content",
  name: "List Page Content",
  description: "List all content blocks on a Notion page"
}

export const listPageContentActionSchema: NodeComponent = {
  type: NOTION_LIST_PAGE_CONTENT_METADATA.key,
  title: "List Page Content",
  description: NOTION_LIST_PAGE_CONTENT_METADATA.description,
  icon: "List" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.read"],
  category: "Productivity",
  outputSchema: [
    {
      name: "blocks",
      label: "Content Blocks",
      type: "array",
      description: "Array of all content blocks on the page",
      example: [{ id: "block_123", type: "paragraph", content: "Hello world" }]
    },
    {
      name: "blockCount",
      label: "Block Count",
      type: "number",
      description: "Total number of blocks on the page",
      example: 5
    },
    {
      name: "pageId",
      label: "Page ID",
      type: "string",
      description: "The ID of the page",
      example: "page_123"
    },
    {
      name: "hasMore",
      label: "Has More",
      type: "boolean",
      description: "Whether there are more blocks to load",
      example: false
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
      description: "The page whose content you want to list",
      loadingText: "Loading pages...",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "filterType",
      label: "Filter by Block Type (Optional)",
      type: "multiselect",
      required: false,
      options: [
        { value: "paragraph", label: "Paragraph" },
        { value: "heading_1", label: "Heading 1" },
        { value: "heading_2", label: "Heading 2" },
        { value: "heading_3", label: "Heading 3" },
        { value: "bulleted_list_item", label: "Bulleted List" },
        { value: "numbered_list_item", label: "Numbered List" },
        { value: "to_do", label: "To-Do" },
        { value: "toggle", label: "Toggle" },
        { value: "code", label: "Code Block" },
        { value: "quote", label: "Quote" },
        { value: "callout", label: "Callout" },
        { value: "divider", label: "Divider" },
        { value: "table", label: "Table" },
        { value: "image", label: "Image" },
        { value: "file", label: "File" }
      ],
      placeholder: "All block types",
      description: "Only return blocks of specific types",
      dependsOn: "pageId",
      hidden: {
        $deps: ["pageId"],
        $condition: { pageId: { $exists: false } }
      }
    },
    {
      name: "maxBlocks",
      label: "Maximum Blocks",
      type: "number",
      required: false,
      defaultValue: 100,
      min: 1,
      max: 100,
      placeholder: "100",
      description: "Maximum number of blocks to return (Notion API limit is 100 per request)",
      dependsOn: "pageId",
      hidden: {
        $deps: ["pageId"],
        $condition: { pageId: { $exists: false } }
      }
    },
  ],
}
