import { NodeComponent } from "../../../types"

export const itemMovedTriggerSchema: NodeComponent = {
  type: "monday_trigger_item_moved",
  title: "Item Moved to Group",
  description: "Triggers when an item is moved to a different group within the same or different board",
  isTrigger: true,
  providerId: "monday",
  category: "Productivity",
  icon: "Move" as any,
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
      description: "The Monday.com board to monitor for item moves"
    },
    {
      name: "targetGroupId",
      label: "Target Group (Optional)",
      type: "select",
      dynamic: "monday_groups",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      required: false,
      placeholder: "Any group...",
      description: "Optionally filter to only trigger when items move to a specific group",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The unique ID of the moved item"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the moved item"
    },
    {
      name: "sourceBoardId",
      label: "Source Board ID",
      type: "string",
      description: "The ID of the board the item was moved from"
    },
    {
      name: "sourceGroupId",
      label: "Source Group ID",
      type: "string",
      description: "The ID of the group the item was moved from"
    },
    {
      name: "sourceGroupTitle",
      label: "Source Group Title",
      type: "string",
      description: "The title of the group the item was moved from"
    },
    {
      name: "targetBoardId",
      label: "Target Board ID",
      type: "string",
      description: "The ID of the board the item was moved to"
    },
    {
      name: "targetGroupId",
      label: "Target Group ID",
      type: "string",
      description: "The ID of the group the item was moved to"
    },
    {
      name: "targetGroupTitle",
      label: "Target Group Title",
      type: "string",
      description: "The title of the group the item was moved to"
    },
    {
      name: "movedAt",
      label: "Moved At",
      type: "string",
      description: "Timestamp when the item was moved"
    },
    {
      name: "movedBy",
      label: "Moved By",
      type: "string",
      description: "The ID of the user who moved the item"
    },
    {
      name: "columnValues",
      label: "Column Values",
      type: "object",
      description: "All column values for the item"
    }
  ],
}
