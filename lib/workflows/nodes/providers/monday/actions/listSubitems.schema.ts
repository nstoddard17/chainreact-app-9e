import { NodeComponent } from "../../../types"

export const listSubitemsActionSchema: NodeComponent = {
  type: "monday_action_list_subitems",
  title: "List Subitems",
  description: "Get a list of all subitems under a specific item",
  icon: "List" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "subitems",
      label: "Subitems",
      type: "array",
      description: "Array of all subitems under the parent item",
      example: '[{"id": "123", "name": "Subtask 1", "created_at": "2024-01-15T10:30:00Z"}]'
    },
    {
      name: "count",
      label: "Subitem Count",
      type: "number",
      description: "Total number of subitems",
      example: "8"
    },
    {
      name: "parentItemId",
      label: "Parent Item ID",
      type: "string",
      description: "The ID of the parent item",
      example: "9876543210"
    },
    {
      name: "parentItemName",
      label: "Parent Item Name",
      type: "string",
      description: "The name of the parent item",
      example: "Main Task"
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
      description: "The board containing the parent item"
    },
    {
      name: "parentItemId",
      label: "Parent Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select a parent item...",
      description: "The item to list subitems from",
      supportsAI: true
    }
  ],
}
