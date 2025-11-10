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
    // Parent field - always visible
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

    // Level 1 cascade - show after workspace selected
    {
      name: "channelType",
      label: "Message Location",
      type: "select",
      required: true,
      options: [
        { value: "channel", label: "Channel or Group DM" },
        { value: "dm", label: "Direct Message (DM)" }
      ],
      placeholder: "Select message location...",
      description: "Where is the message you want to delete?",
      tooltip: "Choose 'Channel' for public/private channels and group DMs, or 'Direct Message' for 1-on-1 DMs",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },

    // Level 2 cascade - show after message location selected (channel option)
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: false,
      placeholder: "Select a channel...",
      description: "The channel containing the message to delete",
      tooltip: "You can only delete messages in channels where the bot has access.",
      dependsOn: "channelType",
      hidden: {
        $deps: ["workspace", "channelType"],
        $condition: {
          $or: [
            { workspace: { $exists: false } },
            { channelType: { $ne: "channel" } }
          ]
        }
      }
    },

    // Level 2 cascade - show after message location selected (DM option)
    {
      name: "user",
      label: "User",
      type: "combobox",
      dynamic: "slack_users",
      required: false,
      searchable: true,
      loadOnMount: true,
      placeholder: "Select a user...",
      description: "The user whose DM contains the message to delete",
      tooltip: "Select the user you have a direct message conversation with",
      dependsOn: "channelType",
      hidden: {
        $deps: ["workspace", "channelType"],
        $condition: {
          $or: [
            { workspace: { $exists: false } },
            { channelType: { $ne: "dm" } }
          ]
        }
      }
    },

    // Level 3 cascade - show after channel or user selected
    {
      name: "messageId",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}} or 1234567890.123456",
      supportsAI: true,
      description: "The timestamp of the message to delete",
      tooltip: "This is the 'ts' value from Slack (e.g., 1234567890.123456). Get this from a trigger or the 'Send Message' action output. Only the message author, workspace admin, or workspace owner can delete messages.",
      dependsOn: "channelType",
      hidden: {
        $deps: ["workspace", "channelType", "channel", "user"],
        $condition: {
          $or: [
            { workspace: { $exists: false } },
            { channelType: { $exists: false } },
            {
              $and: [
                { channel: { $exists: false } },
                { user: { $exists: false } }
              ]
            }
          ]
        }
      }
    },

    // Level 3 cascade - show after channel or user selected
    {
      name: "asUser",
      label: "Delete as User",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Delete the message as the authenticated user instead of the bot",
      tooltip: "When enabled, the delete action is performed as the user. When disabled, it's performed as the bot. You must have permission to delete the message.",
      dependsOn: "channelType",
      hidden: {
        $deps: ["workspace", "channelType", "channel", "user"],
        $condition: {
          $or: [
            { workspace: { $exists: false } },
            { channelType: { $exists: false } },
            {
              $and: [
                { channel: { $exists: false } },
                { user: { $exists: false } }
              ]
            }
          ]
        }
      }
    }
  ]
}
