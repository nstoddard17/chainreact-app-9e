import { NodeComponent } from "../../../types"

export const createSubitemActionSchema: NodeComponent = {
  type: "monday_action_create_subitem",
  title: "Create Subitem",
  description: "Create a new subitem under an existing item in Monday.com",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "subitemId",
      label: "Subitem ID",
      type: "string",
      description: "The unique ID of the created subitem",
      example: "1234567890"
    },
    {
      name: "subitemName",
      label: "Subitem Name",
      type: "string",
      description: "The name of the created subitem",
      example: "New Subtask"
    },
    {
      name: "parentItemId",
      label: "Parent Item ID",
      type: "string",
      description: "The ID of the parent item",
      example: "9876543210"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the parent item",
      example: "1111222233"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the subitem was created",
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
      description: "The Monday.com board containing the parent item"
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
      description: "The item under which the subitem will be created",
      supportsAI: true
    },
    {
      name: "subitemName",
      label: "Subitem Name",
      type: "text",
      required: true,
      placeholder: "Enter subitem name...",
      description: "The name/title of the new subitem",
      supportsAI: true,
      dependsOn: "parentItemId",
      hidden: {
        $deps: ["parentItemId"],
        $condition: { parentItemId: { $exists: false } }
      }
    }
  ],
}
