import { NodeComponent } from "../../../types"

export const searchItemsActionSchema: NodeComponent = {
  type: "monday_action_search_items",
  title: "Search Items by Column Values",
  description: "Search for items in a board based on specific column values",
  icon: "Search" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "items",
      label: "Found Items",
      type: "array",
      description: "Array of items that match the search criteria",
      example: '[{"id": "123", "name": "Task 1"}, {"id": "456", "name": "Task 2"}]'
    },
    {
      name: "count",
      label: "Item Count",
      type: "number",
      description: "Number of items found",
      example: "2"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board searched",
      example: "9876543210"
    }
  ],
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board to search in"
    },
    {
      name: "columnId",
      label: "Column",
      type: "select",
      dynamic: "monday_columns",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select a column...",
      description: "The column to search by"
    },
    {
      name: "columnValue",
      label: "Column Value",
      type: "text",
      required: true,
      placeholder: "Enter value to search for...",
      description: "The value to search for in the specified column",
      supportsAI: true
    },
    {
      name: "limit",
      label: "Result Limit",
      type: "number",
      required: false,
      placeholder: "25",
      description: "Maximum number of items to return (default: 25)"
    },
    {
      name: "groupId",
      label: "Group (Optional)",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: false,
      placeholder: "All groups...",
      description: "Optionally limit search to a specific group"
    }
  ],
}
