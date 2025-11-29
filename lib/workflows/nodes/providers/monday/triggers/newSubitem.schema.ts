import { NodeComponent } from "../../../types"

export const newSubitemTriggerSchema: NodeComponent = {
  type: "monday_trigger_new_subitem",
  title: "New Subitem Created",
  description: "Triggers when a new subitem is created under any item in a Monday.com board",
  isTrigger: true,
  providerId: "monday",
  category: "Productivity",
  icon: "Plus" as any,
  producesOutput: true,
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board to monitor for new subitems"
    },
    {
      name: "parentItemId",
      label: "Parent Item (Optional)",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      required: false,
      placeholder: "Any item...",
      description: "Optionally filter to only trigger for subitems under a specific parent item"
    }
  ],
  outputSchema: [
    {
      name: "subitemId",
      label: "Subitem ID",
      type: "string",
      description: "The unique ID of the created subitem"
    },
    {
      name: "subitemName",
      label: "Subitem Name",
      type: "string",
      description: "The name of the created subitem"
    },
    {
      name: "parentItemId",
      label: "Parent Item ID",
      type: "string",
      description: "The ID of the parent item"
    },
    {
      name: "parentItemName",
      label: "Parent Item Name",
      type: "string",
      description: "The name of the parent item"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the parent item"
    },
    {
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who created the subitem"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the subitem was created"
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "object",
      description: "All column values for the subitem"
    }
  ],
}
