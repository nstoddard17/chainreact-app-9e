import { NodeComponent } from "../../../types"

const SLACK_POST_INTERACTIVE_METADATA = {
  key: "slack_action_post_interactive",
  name: "Post Interactive Blocks",
  description: "Post interactive Block Kit messages with buttons, menus, and other elements"
}

export const postInteractiveBlocksActionSchema: NodeComponent = {
  type: SLACK_POST_INTERACTIVE_METADATA.key,
  title: SLACK_POST_INTERACTIVE_METADATA.name,
  description: SLACK_POST_INTERACTIVE_METADATA.description,
  icon: "Layout" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["chat:write"],
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
      name: "channel",
      label: "Channel",
      type: "select",
      required: true,
      dynamic: "slack_channels",
      dependsOn: "workspace",
      placeholder: "Select a channel",
      tooltip: "Select the Slack channel where you want to post the interactive message.",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "text",
      label: "Fallback Text",
      type: "text",
      required: true,
      placeholder: "This message contains interactive elements",
      tooltip: "Plain text fallback for notifications and accessibility. This text is shown in push notifications and when blocks can't be rendered.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "blocks",
      label: "Message Blocks",
      type: "slack-block-builder",
      required: true,
      supportsAI: true,
      tooltip: "Build your interactive message using the visual editor, or switch to Raw JSON mode for advanced configurations. Use headers, sections with buttons, dividers, images, and more.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "threadTimestamp",
      label: "Thread Timestamp (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.ts}}",
      supportsAI: true,
      tooltip: "Reply to a specific message thread by providing its timestamp. Leave empty to post as a new message.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, sends the message as YOU instead of the bot. Requires user permissions granted during Slack connection.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: false,
      tooltip: "Enable automatic link previews for URLs in the blocks.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "unfurlMedia",
      label: "Unfurl Media",
      type: "boolean",
      defaultValue: false,
      tooltip: "Enable automatic media previews for image/video links in the blocks.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
  ],
  outputSchema: [
    {
      name: "ts",
      label: "Message Timestamp",
      type: "string",
      description: "The timestamp of the posted message"
    },
    {
      name: "channel",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was posted"
    },
    {
      name: "message",
      label: "Message Object",
      type: "object",
      description: "The complete message object returned by Slack"
    }
  ]
}
