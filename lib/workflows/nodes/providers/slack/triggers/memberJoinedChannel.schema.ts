import { NodeComponent } from "../../../types"

export const memberJoinedChannelTriggerSchema: NodeComponent = {
  type: "slack_trigger_member_joined_channel",
  title: "Member Joined Channel",
  description: "Triggers when a user joins a channel",
  icon: "UserPlus" as any, // Will be resolved in index file
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
      dynamic: "slack_channels",
      description: "Optional: Filter to a specific channel. Leave empty to watch all channels."
    },
  ],
  outputSchema: [
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who joined"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user who joined"
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
      description: "The ID of the channel the user joined"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel"
    },
    {
      name: "inviterId",
      label: "Inviter User ID",
      type: "string",
      description: "The ID of the user who invited them (if available)"
    },
    {
      name: "inviterName",
      label: "Inviter Name",
      type: "string",
      description: "The name of the user who invited them (if available)"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the user joined"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}
