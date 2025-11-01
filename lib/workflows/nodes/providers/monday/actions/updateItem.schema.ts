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
      label: "Item ID",
      type: "text",
      required: true,
      placeholder: "Enter item ID or use a variable...",
      description: "The ID of the item to update",
      supportsAI: false
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "json",
      required: true,
      placeholder: '{"status": "Done", "date": "2024-01-15"}',
      description: "The column values to update (JSON format)",
      supportsAI: true
    }
  ],
}
