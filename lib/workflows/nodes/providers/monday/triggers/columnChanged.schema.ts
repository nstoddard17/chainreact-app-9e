import { NodeComponent } from "../../../types"

export const columnChangedTriggerSchema: NodeComponent = {
  type: "monday_trigger_column_changed",
  title: "Column Value Changed",
  description: "Triggers when a column value changes in a Monday.com board.",
  isTrigger: true,
  providerId: "monday",
  category: "Productivity",
  icon: "Edit" as any,
  producesOutput: true,
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: false,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board to monitor"
    },
    {
      name: "columnId",
      label: "Column",
      type: "select",
      dynamic: "monday_columns",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a column...",
      description: "Optional: limit to a specific column",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      }
    },
  ],
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item with the changed column"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name/title of the item"
    },
    {
      name: "columnId",
      label: "Column ID",
      type: "string",
      description: "The ID of the column that changed"
    },
    {
      name: "columnTitle",
      label: "Column Title",
      type: "string",
      description: "The title of the column that changed"
    },
    {
      name: "previousValue",
      label: "Previous Value",
      type: "string",
      description: "The previous value of the column"
    },
    {
      name: "newValue",
      label: "New Value",
      type: "string",
      description: "The new value of the column"
    },
    {
      name: "changedBy",
      label: "Changed By",
      type: "string",
      description: "The user who made the change"
    },
    {
      name: "changedAt",
      label: "Changed At",
      type: "string",
      description: "Timestamp when the change occurred"
    }
  ],
}
