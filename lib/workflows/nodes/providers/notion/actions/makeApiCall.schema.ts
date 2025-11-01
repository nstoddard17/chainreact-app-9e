import { NodeComponent } from "../../../types"

const NOTION_MAKE_API_CALL_METADATA = {
  key: "notion_action_api_call",
  name: "Make API Call",
  description: "Make a custom API call to Notion's API for advanced use cases"
}

export const makeApiCallActionSchema: NodeComponent = {
  type: NOTION_MAKE_API_CALL_METADATA.key,
  title: "Make API Call",
  description: NOTION_MAKE_API_CALL_METADATA.description,
  icon: "Code" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "notion",
  testable: true,
  requiredScopes: ["content.read", "content.write"],
  category: "Productivity",
  outputSchema: [
    {
      name: "data",
      label: "Response Data",
      type: "object",
      description: "The response from the Notion API",
      example: { object: "page", id: "page_123" }
    },
    {
      name: "status",
      label: "HTTP Status",
      type: "number",
      description: "The HTTP status code of the response",
      example: 200
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the API call was successful",
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
      placeholder: "Select Notion workspace",
      description: "Your Notion workspace (used for authentication)"
    },
    {
      name: "endpoint",
      label: "API Endpoint",
      type: "text",
      required: true,
      placeholder: "/v1/pages/{page_id}",
      description: "The Notion API endpoint (e.g., /v1/pages, /v1/databases/{database_id}/query)",
      tooltip: "See Notion API docs: https://developers.notion.com/reference/intro"
    },
    {
      name: "method",
      label: "HTTP Method",
      type: "select",
      required: true,
      options: [
        { value: "GET", label: "GET - Retrieve data" },
        { value: "POST", label: "POST - Create or query" },
        { value: "PATCH", label: "PATCH - Update" },
        { value: "DELETE", label: "DELETE - Delete/archive" }
      ],
      defaultValue: "GET",
      description: "The HTTP method to use"
    },
    {
      name: "headers",
      label: "Custom Headers (Optional)",
      type: "object",
      required: false,
      placeholder: JSON.stringify({ "Notion-Version": "2022-06-28" }, null, 2),
      description: "Additional HTTP headers (Notion-Version is included automatically)",
      tooltip: "JSON object with header key-value pairs. Authentication is handled automatically."
    },
    {
      name: "body",
      label: "Request Body (Optional)",
      type: "object",
      required: false,
      placeholder: JSON.stringify({
        "filter": {
          "property": "Status",
          "status": {
            "equals": "Done"
          }
        }
      }, null, 2),
      supportsAI: true,
      description: "Request body in JSON format (for POST/PATCH requests)",
      tooltip: "Not needed for GET requests. See Notion API docs for body structure."
    },
    {
      name: "queryParams",
      label: "Query Parameters (Optional)",
      type: "object",
      required: false,
      placeholder: JSON.stringify({ "page_size": 100 }, null, 2),
      description: "URL query parameters as JSON object",
      tooltip: "Example: {\"page_size\": 100, \"start_cursor\": \"abc123\"}"
    },
  ],
}
