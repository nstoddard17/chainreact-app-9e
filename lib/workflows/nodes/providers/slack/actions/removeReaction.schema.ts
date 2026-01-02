import { NodeComponent } from "../../../types"

const SLACK_REMOVE_REACTION_METADATA = {
  key: "slack_action_remove_reaction",
  name: "Remove Reaction",
  description: "Remove all reactions you've added to a message"
}

export const removeReactionActionSchema: NodeComponent = {
  type: SLACK_REMOVE_REACTION_METADATA.key,
  title: SLACK_REMOVE_REACTION_METADATA.name,
  description: SLACK_REMOVE_REACTION_METADATA.description,
  icon: "Frown" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["reactions:write", "reactions:read"],
  category: "Communication",
  isTrigger: false,
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
      name: "asUser",
      label: "Execute as User",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Execute this action as yourself instead of the Chain React bot. This removes YOUR reactions from the message.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel",
      tooltip: "Select the channel where the message is located",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
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
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the reactions were removed successfully"
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
      description: "The timestamp of the message that reactions were removed from"
    },
    {
      name: "removedEmojis",
      label: "Removed Emojis",
      type: "array",
      description: "List of emojis that were removed"
    },
    {
      name: "removedCount",
      label: "Removed Count",
      type: "number",
      description: "Number of reactions removed"
    }
  ]
}
