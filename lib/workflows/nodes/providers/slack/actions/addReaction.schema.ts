import { NodeComponent } from "../../../types"

const SLACK_ADD_REACTION_METADATA = {
  key: "slack_action_add_reaction",
  name: "Add Reaction",
  description: "Add an emoji reaction to a message"
}

export const addReactionActionSchema: NodeComponent = {
  type: SLACK_ADD_REACTION_METADATA.key,
  title: SLACK_ADD_REACTION_METADATA.name,
  description: SLACK_ADD_REACTION_METADATA.description,
  icon: "Smile" as any, // Will be resolved in index file
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
      placeholder: "{{trigger.ts}} or 1234567890.123456",
      supportsAI: true,
      tooltip: "The unique Slack message ID (format: 1234567890.123456). To find manually: right-click a message → 'Copy link' → the URL contains 'p1234567890123456' - remove the 'p' and add a decimal after the 10th digit. Or use variables like {{trigger.ts}} from previous workflow steps.",
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
      tooltip: "Select an emoji to add as a reaction. Includes both standard emojis and custom workspace emojis.",
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
      description: "Whether the reaction was added successfully"
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
      description: "The timestamp of the message that was reacted to"
    },
    {
      name: "emoji",
      label: "Emoji Name",
      type: "string",
      description: "The emoji that was added"
    }
  ]
}
