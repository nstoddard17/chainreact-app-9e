import { NodeComponent } from "../../../types"

export const moveItemActionSchema: NodeComponent = {
  type: "monday_action_move_item",
  title: "Move Item Between Groups",
  description: "Move an item to a different group within the same or different board",
  icon: "Move" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the moved item",
      example: "1234567890"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the moved item",
      example: "Task Name"
    },
    {
      name: "sourceBoardId",
      label: "Source Board ID",
      type: "string",
      description: "The ID of the original board",
      example: "9876543210"
    },
    {
      name: "sourceGroupId",
      label: "Source Group ID",
      type: "string",
      description: "The ID of the original group",
      example: "topics"
    },
    {
      name: "targetBoardId",
      label: "Target Board ID",
      type: "string",
      description: "The ID of the destination board",
      example: "1111222233"
    },
    {
      name: "targetGroupId",
      label: "Target Group ID",
      type: "string",
      description: "The ID of the destination group",
      example: "new_group"
    },
    {
      name: "movedAt",
      label: "Moved At",
      type: "string",
      description: "Timestamp when the item was moved",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "sourceBoardId",
      label: "Source Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select source board...",
      description: "The board containing the item to move"
    },
    {
      name: "itemId",
      label: "Item to Move",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "sourceBoardId",
      dependsOn: "sourceBoardId",
      hidden: {
        $deps: ["sourceBoardId"],
        $condition: { sourceBoardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select an item...",
      description: "The item to move to a different group",
      supportsAI: true
    },
    {
      name: "targetBoardId",
      label: "Target Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select target board...",
      description: "The board where the item will be moved (can be same as source)"
    },
    {
      name: "targetGroupId",
      label: "Target Group",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "targetBoardId",
      dependsOn: "targetBoardId",
      hidden: {
        $deps: ["targetBoardId"],
        $condition: { targetBoardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select target group...",
      description: "The group where the item will be moved"
    }
  ],
}
