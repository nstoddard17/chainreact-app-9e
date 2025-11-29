import { NodeComponent } from "../../../types"

export const duplicateItemActionSchema: NodeComponent = {
  type: "monday_action_duplicate_item",
  title: "Duplicate Item",
  description: "Create a duplicate copy of an existing item in Monday.com",
  icon: "Copy" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "newItemId",
      label: "New Item ID",
      type: "string",
      description: "The unique ID of the duplicated item",
      example: "1234567890"
    },
    {
      name: "newItemName",
      label: "New Item Name",
      type: "string",
      description: "The name of the duplicated item",
      example: "Task Name (copy)"
    },
    {
      name: "originalItemId",
      label: "Original Item ID",
      type: "string",
      description: "The ID of the original item that was duplicated",
      example: "9876543210"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the items",
      example: "1111222233"
    },
    {
      name: "groupId",
      label: "Group ID",
      type: "string",
      description: "The ID of the group containing the duplicated item",
      example: "topics"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the duplicate was created",
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
      description: "The Monday.com board containing the item to duplicate"
    },
    {
      name: "itemId",
      label: "Item to Duplicate",
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
      description: "The item to create a duplicate of",
      supportsAI: true
    },
    {
      name: "targetBoardId",
      label: "Target Board (Optional)",
      type: "select",
      dynamic: "monday_boards",
      required: false,
      loadOnMount: true,
      placeholder: "Same as source board...",
      description: "Optionally duplicate to a different board"
    },
    {
      name: "targetGroupId",
      label: "Target Group (Optional)",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "targetBoardId",
      dependsOn: "targetBoardId",
      hidden: {
        $deps: ["targetBoardId"],
        $condition: { targetBoardId: { $exists: false } }
      },
      required: false,
      placeholder: "Same as source group...",
      description: "Optionally place duplicate in a different group"
    },
    {
      name: "withUpdates",
      label: "Include Updates",
      type: "select",
      required: false,
      options: [
        { label: "No (default)", value: "false" },
        { label: "Yes", value: "true" }
      ],
      placeholder: "Exclude updates...",
      description: "Whether to copy updates/comments to the duplicate"
    }
  ],
}
