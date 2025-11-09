import { NodeComponent } from "../../../types"

export const reactionRemovedTriggerSchema: NodeComponent = {
  type: "slack_trigger_reaction_removed",
  title: "Reaction Removed",
  description: "Triggers when a reaction is removed from a message",
  icon: "HeartOff" as any, // Will be resolved in index file
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
    {
      name: "emoji",
      label: "Emoji (Optional)",
      type: "text",
      required: false,
      placeholder: "thumbsup, heart, eyes",
      description: "Optional: Filter to a specific emoji. Use emoji name without colons (e.g., 'thumbsup' not ':thumbsup:')"
    },
  ],
  outputSchema: [
    {
      name: "emoji",
      label: "Emoji",
      type: "string",
      description: "The emoji that was removed (without colons)"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who removed the reaction"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user who removed the reaction"
    },
    {
      name: "messageTs",
      label: "Message Timestamp",
      type: "string",
      description: "The timestamp of the message that had the reaction removed"
    },
    {
      name: "messageText",
      label: "Message Text",
      type: "string",
      description: "The content of the message (if available)"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the reaction was removed"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}
