import { NodeComponent } from "../../../types"

const SLACK_DELETE_MESSAGE_METADATA = {
  key: "slack_action_delete_message",
  name: "Delete Message",
  description: "Delete a message from a Slack channel or DM"
}

export const deleteMessageActionSchema: NodeComponent = {
  type: SLACK_DELETE_MESSAGE_METADATA.key,
  title: "Delete Message",
  description: SLACK_DELETE_MESSAGE_METADATA.description,
  icon: "Trash2" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["chat:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "deleted",
      label: "Deleted",
      type: "boolean",
      description: "Whether the message was successfully deleted",
      example: true
    },
    {
      name: "channel",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was deleted",
      example: "C1234567890"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The ID of the deleted message",
      example: "1234567890.123456"
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "When the message was deleted",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      dynamic: "slack_workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel...",
      description: "The channel containing the message to delete",
      tooltip: "You can only delete messages in channels where the bot has access."
    },
    {
      name: "messageId",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}} or 1234567890.123456",
      supportsAI: true,
      description: "The timestamp of the message to delete",
      tooltip: "This is the 'ts' value from Slack (e.g., 1234567890.123456). Get this from a trigger or the 'Send Message' action output. Only the message author, workspace admin, or workspace owner can delete messages.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "asUser",
      label: "Delete as User",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Delete the message as the authenticated user instead of the bot",
      tooltip: "When enabled, the delete action is performed as the user. When disabled, it's performed as the bot. You must have permission to delete the message.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ]
}
