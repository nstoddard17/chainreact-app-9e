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
      name: "channel",
      label: "Channel",
      type: "select",
      required: true,
      dynamic: "slack-channels",
      loadOnMount: true,
      placeholder: "Select a channel",
      tooltip: "Select the Slack channel where you want to post the interactive message."
    },
    {
      name: "text",
      label: "Fallback Text",
      type: "text",
      required: true,
      placeholder: "This message contains interactive elements",
      tooltip: "Plain text fallback for notifications and accessibility. This text is shown in push notifications and when blocks can't be rendered."
    },
    {
      name: "blocks",
      label: "Block Kit JSON",
      type: "object",
      required: true,
      placeholder: JSON.stringify([
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Hello!* Click the button below:"
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Click Me"
              },
              value: "button_clicked",
              action_id: "button_1"
            }
          ]
        }
      ], null, 2),
      supportsAI: true,
      tooltip: "Block Kit JSON array defining the interactive message structure. Use the Slack Block Kit Builder (https://app.slack.com/block-kit-builder) to design your blocks visually, then paste the JSON here."
    },
    {
      name: "threadTimestamp",
      label: "Thread Timestamp (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.ts}}",
      supportsAI: true,
      tooltip: "Reply to a specific message thread by providing its timestamp. Leave empty to post as a new message."
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, sends the message as YOU instead of the bot. Requires user permissions granted during Slack connection."
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: false,
      tooltip: "Enable automatic link previews for URLs in the blocks."
    },
    {
      name: "unfurlMedia",
      label: "Unfurl Media",
      type: "boolean",
      defaultValue: false,
      tooltip: "Enable automatic media previews for image/video links in the blocks."
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
