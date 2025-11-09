import { NodeComponent } from "../../../types"

export const reactionAddedTriggerSchema: NodeComponent = {
  type: "slack_trigger_reaction_added",
  title: "Reaction Added",
  description: "Triggers when a reaction is added to a message",
  icon: "Heart" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "channel",
      label: "Channel",
      type: "select",
      required: false,
      dynamic: "slack_channels",
      description: "Optional: Filter to a specific channel. Leave empty to listen to all channels.",
      loadOnMount: true
    },
    {
      name: "emoji",
      label: "Emoji",
      type: "emoji-picker",
      required: false,
      dynamic: "slack_emoji_catalog",
      loadOnMount: true,
      placeholder: "Choose an emoji to filter",
      description: "Optional: Filter to a specific emoji. Leave empty to listen to all reactions."
    },
  ],
  outputSchema: [
    {
      name: "reaction",
      label: "Reaction Emoji",
      type: "string",
      description: "The emoji that was added (without colons)"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who added the reaction"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user who added the reaction"
    },
    {
      name: "messageUserId",
      label: "Message Author ID",
      type: "string",
      description: "The ID of the user who wrote the original message"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the reaction was added"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel where the reaction was added"
    },
    {
      name: "messageTimestamp",
      label: "Message Timestamp",
      type: "string",
      description: "The timestamp of the message that was reacted to"
    },
    {
      name: "eventTimestamp",
      label: "Reaction Timestamp",
      type: "string",
      description: "When the reaction was added"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}