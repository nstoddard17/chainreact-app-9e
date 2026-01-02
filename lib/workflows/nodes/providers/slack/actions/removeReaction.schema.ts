import { NodeComponent } from "../../../types"

const SLACK_REMOVE_REACTION_METADATA = {
  key: "slack_action_remove_reaction",
  name: "Remove Reaction",
  description: "Remove an emoji reaction from a message"
}

export const removeReactionActionSchema: NodeComponent = {
  type: SLACK_REMOVE_REACTION_METADATA.key,
  title: SLACK_REMOVE_REACTION_METADATA.name,
  description: SLACK_REMOVE_REACTION_METADATA.description,
  icon: "Frown" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["reactions:write"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    // Parent field - always visible
    {
      name: "channel",
      label: "Channel",
      type: "select",
      required: true,
      dynamic: "slack_channels",
      loadOnMount: true,
      placeholder: "Select a channel",
      tooltip: "Select the channel where the message is located"
    },

    // Cascaded fields - only show after channel selected
    {
      name: "timestamp",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.ts}} or paste message URL",
      supportsAI: true,
      tooltip: "Paste the full Slack message URL (e.g., https://workspace.slack.com/archives/C123/p1767325385562299) or just the timestamp (1767325385.562299). Right-click any message in Slack and select 'Copy link' to get the URL. You can also use variables like {{trigger.ts}} from previous workflow steps.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "emoji",
      label: "Emoji",
      type: "emoji-picker",
      required: true,
      dynamic: "slack_emoji_catalog",
      loadOnMount: true,
      searchable: true,
      placeholder: "Choose an emoji",
      supportsAI: true,
      tooltip: "Select an emoji to remove from the message. Includes both standard emojis and custom workspace emojis.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the reaction was removed successfully"
    },
    {
      name: "channel",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel containing the message"
    },
    {
      name: "timestamp",
      label: "Message Timestamp",
      type: "string",
      description: "The timestamp of the message that the reaction was removed from"
    },
    {
      name: "emoji",
      label: "Emoji Name",
      type: "string",
      description: "The emoji that was removed"
    }
  ]
}
