import { NodeComponent } from "../../../types"

export const newUpdateTriggerSchema: NodeComponent = {
  type: "monday_trigger_new_update",
  title: "New Update Posted",
  description: "Triggers when a new update/comment is posted on a board or item in Monday.com",
  isTrigger: true,
  providerId: "monday",
  category: "Productivity",
  icon: "MessageSquare" as any,
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
      description: "The Monday.com board to monitor for new updates"
    },
    {
      name: "itemId",
      label: "Item (Optional)",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      required: false,
      placeholder: "Any item...",
      description: "Optionally filter to only trigger for updates on a specific item",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "updateId",
      label: "Update ID",
      type: "string",
      description: "The unique ID of the update"
    },
    {
      name: "updateText",
      label: "Update Text",
      type: "string",
      description: "The text content of the update"
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item the update was posted on (if applicable)"
    },
    {
      name: "itemName",
      label: "Item Name",
      type: "string",
      description: "The name of the item the update was posted on (if applicable)"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the update"
    },
    {
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who posted the update"
    },
    {
      name: "creatorName",
      label: "Creator Name",
      type: "string",
      description: "The name of the user who posted the update"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the update was posted"
    },
    {
      name: "replyToId",
      label: "Reply To ID",
      type: "string",
      description: "If this is a reply, the ID of the update being replied to"
    }
  ],
}
