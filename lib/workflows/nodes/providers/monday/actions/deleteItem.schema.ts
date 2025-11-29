import { NodeComponent } from "../../../types"

export const deleteItemActionSchema: NodeComponent = {
  type: "monday_action_delete_item",
  title: "Delete Item",
  description: "Permanently delete an item from a Monday.com board",
  icon: "Trash2" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Deleted Item ID",
      type: "string",
      description: "The ID of the deleted item",
      example: "1234567890"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board that contained the item",
      example: "9876543210"
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "Timestamp when the item was deleted",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the deletion was successful",
      example: "true"
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
      description: "The Monday.com board containing the item to delete"
    },
    {
      name: "itemId",
      label: "Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      required: true,
      placeholder: "Select an item to delete...",
      description: "The item to permanently delete",
      supportsAI: true
    }
  ],
}
