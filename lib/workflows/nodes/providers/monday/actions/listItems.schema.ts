import { NodeComponent } from "../../../types"

export const listItemsActionSchema: NodeComponent = {
  type: "monday_action_list_items",
  title: "List Board Items",
  description: "Get a list of all items in a Monday.com board or group",
  icon: "List" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "items",
      label: "Items",
      type: "array",
      description: "Array of all items in the board or group",
      example: '[{"id": "123", "name": "Task 1", "group": "topics"}, {"id": "456", "name": "Task 2", "group": "topics"}]'
    },
    {
      name: "count",
      label: "Item Count",
      type: "number",
      description: "Total number of items retrieved",
      example: "15"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board",
      example: "9876543210"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the board",
      example: "Project Board"
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
      description: "The Monday.com board to list items from"
    },
    {
      name: "groupId",
      label: "Group (Optional)",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "boardId",
      required: false,
      placeholder: "All groups...",
      description: "Optionally filter to items in a specific group"
    },
    {
      name: "limit",
      label: "Item Limit",
      type: "number",
      required: false,
      placeholder: "100",
      description: "Maximum number of items to return (default: 100)"
    },
    {
      name: "state",
      label: "Item State",
      type: "select",
      required: false,
      options: [
        { label: "Active (default)", value: "active" },
        { label: "Archived", value: "archived" },
        { label: "Deleted", value: "deleted" },
        { label: "All", value: "all" }
      ],
      placeholder: "Active items...",
      description: "Filter by item state"
    }
  ],
}
