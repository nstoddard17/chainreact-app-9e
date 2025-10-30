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
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who created the update",
      example: "12345"
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
      name: "itemId",
      label: "Item ID",
      type: "text",
      required: true,
      placeholder: "Enter item ID or use a variable...",
      description: "The ID of the item to post the update to",
      supportsAI: false
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
