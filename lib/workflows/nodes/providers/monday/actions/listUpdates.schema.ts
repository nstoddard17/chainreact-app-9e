import { NodeComponent } from "../../../types"

export const listUpdatesActionSchema: NodeComponent = {
  type: "monday_action_list_updates",
  title: "List Updates",
  description: "Get a list of all updates/comments on an item or board",
  icon: "MessageSquare" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "updates",
      label: "Updates",
      type: "array",
      description: "Array of all updates/comments",
      example: '[{"id": "123", "text": "Update text", "creator_id": "456", "created_at": "2024-01-15T10:30:00Z"}]'
    },
    {
      name: "count",
      label: "Update Count",
      type: "number",
      description: "Total number of updates retrieved",
      example: "12"
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item (if filtered by item)",
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
      description: "The Monday.com board to get updates from"
    },
    {
      name: "itemId",
      label: "Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select an item...",
      description: "The item to get updates from"
    },
    {
      name: "limit",
      label: "Update Limit",
      type: "number",
      required: false,
      placeholder: "50",
      description: "Maximum number of updates to return (default: 50)"
    }
  ],
}
