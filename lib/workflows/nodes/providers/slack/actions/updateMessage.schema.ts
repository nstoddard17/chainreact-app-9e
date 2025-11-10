import { NodeComponent } from "../../../types"

const SLACK_UPDATE_MESSAGE_METADATA = {
  key: "slack_action_update_message",
  name: "Update Message",
  description: "Update an existing message in a Slack channel or DM"
}

export const updateMessageActionSchema: NodeComponent = {
  type: SLACK_UPDATE_MESSAGE_METADATA.key,
  title: "Update Message",
  description: SLACK_UPDATE_MESSAGE_METADATA.description,
  icon: "Edit" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["chat:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The unique ID of the updated message",
      example: "1234567890.123456"
    },
    {
      name: "channel",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel containing the message",
      example: "C1234567890"
    },
    {
      name: "updatedText",
      label: "Updated Text",
      type: "string",
      description: "The new message text",
      example: "Updated message content"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "The timestamp of the message",
      example: "1234567890.123456"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the update was successful",
      example: true
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
      loadOnMount: true,
      placeholder: "Select a channel...",
      description: "The channel containing the message to update",
      tooltip: "You can only update messages in channels where the bot has access.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "messageId",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}} or 1234567890.123456",
      supportsAI: true,
      description: "The timestamp of the message to update",
      tooltip: "This is the 'ts' value from Slack (e.g., 1234567890.123456). Get this from a trigger or the 'Send Message' action output. Only the message author or workspace admin can update messages.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "newText",
      label: "New Message Text",
      type: "slack-rich-text",
      required: true,
      placeholder: "Enter the updated message...",
      supportsAI: true,
      description: "The new text for the message",
      tooltip: "This will completely replace the existing message text. Use the toolbar for rich formatting (bold, italic, links, emojis, etc.).",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "asUser",
      label: "Update as User",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Update the message as the authenticated user instead of the bot",
      tooltip: "When enabled, the message will show as edited by the user. When disabled, it shows as edited by the bot.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Automatically link @mentions and #channels",
      tooltip: "When enabled, @username and #channel will be converted to clickable mentions. Disable if you want to display the text literally.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ]
}
