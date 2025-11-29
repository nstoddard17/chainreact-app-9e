import { NodeComponent } from "../../../types"

export const updateItemActionSchema: NodeComponent = {
  type: "monday_action_update_item",
  title: "Update Item",
  description: "Update column values of an existing item in Monday.com",
  icon: "Edit" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the updated item",
      example: "1234567890"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the updated item",
      example: "Updated Task"
    },
    {
      name: "updatedColumns",
      label: "Updated Columns",
      type: "array",
      description: "List of column IDs that were updated",
      example: ["status", "date", "text"]
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the update was successful",
      example: true
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "Timestamp when the item was updated",
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
      description: "The Monday.com board containing the item"
    },
    {
      name: "itemId",
      label: "Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select an item...",
      description: "The item to update",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      }
    }
  ],
}
