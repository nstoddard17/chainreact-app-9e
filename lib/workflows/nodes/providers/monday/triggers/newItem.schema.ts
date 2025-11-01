import { NodeComponent } from "../../../types"

export const newItemTriggerSchema: NodeComponent = {
  type: "monday_trigger_new_item",
  title: "New Item Created",
  description: "Triggers when a new item is created in a Monday.com board.",
  isTrigger: true,
  providerId: "monday",
  category: "Productivity",
  icon: "CheckSquare" as any,
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
      description: "The Monday.com board to monitor for new items"
    },
  ],
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The unique ID of the created item"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name/title of the item"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the item"
    },
    {
      name: "groupId",
      label: "Group ID",
      type: "string",
      description: "The ID of the group containing the item"
    },
    {
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who created the item"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the item was created"
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "object",
      description: "All column values for the item"
    }
  ],
}
