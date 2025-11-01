import { NodeComponent } from "../../../types"

const NOTION_SEARCH_OBJECTS_METADATA = {
  key: "notion_action_search",
  name: "Search Objects",
  description: "Search for pages and databases in your Notion workspace"
}

export const searchObjectsActionSchema: NodeComponent = {
  type: NOTION_SEARCH_OBJECTS_METADATA.key,
  title: "Search Objects",
  description: NOTION_SEARCH_OBJECTS_METADATA.description,
  icon: "Search" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.read"],
  category: "Productivity",
  outputSchema: [
    {
      name: "results",
      label: "Search Results",
      type: "array",
      description: "Array of pages and databases matching your search",
      example: [{ id: "page_123", type: "page", title: "My Page" }]
    },
    {
      name: "resultCount",
      label: "Result Count",
      type: "number",
      description: "Number of results found",
      example: 5
    },
    {
      name: "hasMore",
      label: "Has More",
      type: "boolean",
      description: "Whether there are more results available",
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
      name: "query",
      label: "Search Query",
      type: "text",
      required: false,
      placeholder: "Enter search terms...",
      supportsAI: true,
      description: "Text to search for. Leave empty to return all pages and databases.",
      tooltip: "Searches titles, page content, and database names. Case-insensitive."
    },
    {
      name: "filter",
      label: "Filter by Type",
      type: "select",
      required: false,
      options: [
        { value: "all", label: "All (Pages & Databases)" },
        { value: "page", label: "Pages Only" },
        { value: "database", label: "Databases Only" }
      ],
      defaultValue: "all",
      description: "Limit search to specific object types"
    },
    {
      name: "sort",
      label: "Sort By",
      type: "select",
      required: false,
      options: [
        { value: "relevance", label: "Relevance" },
        { value: "last_edited_time_desc", label: "Last Edited (Newest First)" },
        { value: "last_edited_time_asc", label: "Last Edited (Oldest First)" }
      ],
      defaultValue: "relevance",
      description: "How to order the search results"
    },
    {
      name: "maxResults",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      min: 1,
      max: 100,
      placeholder: "100",
      description: "Maximum number of results to return (Notion API limit is 100)"
    },
  ],
}
