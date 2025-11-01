import { NodeComponent } from "../../../types"

export const memberLeftChannelTriggerSchema: NodeComponent = {
  type: "slack_trigger_member_left_channel",
  title: "Member Left Channel",
  description: "Triggers when a user leaves a channel",
  icon: "UserMinus" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "channel",
      label: "Channel (Optional)",
      type: "select",
      required: false,
      dynamic: "slack-channels",
      description: "Optional: Filter to a specific channel. Leave empty to watch all channels."
    },
  ],
  outputSchema: [
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who left"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user who left"
    },
    {
      name: "userEmail",
      label: "User Email",
      type: "string",
      description: "The email address of the user (if available)"
    },
    {
      name: "userRealName",
      label: "User Real Name",
      type: "string",
      description: "The real name of the user"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel the user left"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the user left"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}
