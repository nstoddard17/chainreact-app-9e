import { NodeComponent } from "../../../types"

export const getItemActionSchema: NodeComponent = {
  type: "monday_action_get_item",
  title: "Get Item",
  description: "Retrieve details of a specific item from Monday.com by its ID",
  icon: "Search" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The unique ID of the item",
      example: "1234567890"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the item",
      example: "Task Name"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the item",
      example: "9876543210"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the board containing the item",
      example: "Project Board"
    },
    {
      name: "groupId",
      label: "Group ID",
      type: "string",
      description: "The ID of the group containing the item",
      example: "topics"
    },
    {
      name: "groupTitle",
      label: "Group Title",
      type: "string",
      description: "The title of the group containing the item",
      example: "In Progress"
    },
    {
      name: "state",
      label: "State",
      type: "string",
      description: "The state of the item (active, archived, deleted)",
      example: "active"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the item was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "Timestamp when the item was last updated",
      example: "2024-01-16T14:20:00Z"
    },
    {
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who created the item",
      example: "12345"
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "object",
      description: "All column values for the item",
      example: '{"status": "Working on it", "date": "2024-01-15"}'
    },
    {
      name: "subscribers",
      label: "Subscribers",
      type: "array",
      description: "List of user IDs subscribed to this item",
      example: '["12345", "67890"]'
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
      description: "The Monday.com board containing the item"
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select or enter item ID...",
      description: "The ID of the item to retrieve",
      supportsAI: true
    }
  ],
}
