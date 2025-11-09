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
      placeholder: "{{trigger.ts}} or 1234567890.123456",
      supportsAI: true,
      tooltip: "The timestamp of the message to remove reaction from. Use variables like {{trigger.ts}} or {{previous_node.ts}} from previous workflow steps.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "emoji",
      label: "Emoji",
      type: "text",
      required: true,
      placeholder: "thumbsup",
      supportsAI: true,
      tooltip: "The emoji name WITHOUT colons to remove. Examples: 'thumbsup', 'heart', 'fire', 'eyes'. For custom emoji, use the custom emoji name.",
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
