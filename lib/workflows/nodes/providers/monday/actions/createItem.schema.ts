import { NodeComponent } from "../../../types"

export const createItemActionSchema: NodeComponent = {
  type: "monday_action_create_item",
  title: "Create Item",
  description: "Create a new item in a Monday.com board",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The unique ID of the created item",
      example: "1234567890"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the created item",
      example: "New Task"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the item",
      example: "9876543210"
    },
    {
      name: "groupId",
      label: "Group ID",
      type: "string",
      description: "The ID of the group containing the item",
      example: "topics"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the item was created",
      example: "2024-01-15T10:30:00Z"
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
      description: "The Monday.com board where the item will be created"
    },
    {
      name: "groupId",
      label: "Group",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select a group...",
      description: "The group within the board where the item will be created"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "text",
      required: true,
      placeholder: "Enter item name...",
      description: "The name/title of the new item",
      supportsAI: true
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "json",
      required: false,
      placeholder: '{"status": "Working on it", "date": "2024-01-15"}',
      description: "Optional: Set initial values for specific columns (JSON format)",
      supportsAI: true
    }
  ],
}
