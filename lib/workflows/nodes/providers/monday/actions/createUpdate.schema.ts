import { NodeComponent } from "../../../types"

export const createUpdateActionSchema: NodeComponent = {
  type: "monday_action_create_update",
  title: "Create Update",
  description: "Post an update/comment to an item in Monday.com",
  icon: "MessageSquare" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "updateId",
      label: "Update ID",
      type: "string",
      description: "The unique ID of the created update",
      example: "1234567890"
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item the update was posted to",
      example: "9876543210"
    },
    {
      name: "text",
      label: "Update Text",
      type: "string",
      description: "The text content of the update",
      example: "This task is complete!"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the update was created",
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
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select an item...",
      description: "The item to post the update to",
      supportsAI: true
    },
    {
      name: "text",
      label: "Update Text",
      type: "textarea",
      required: true,
      placeholder: "Enter your update message...",
      description: "The content of the update/comment",
      supportsAI: true
    }
  ],
}
