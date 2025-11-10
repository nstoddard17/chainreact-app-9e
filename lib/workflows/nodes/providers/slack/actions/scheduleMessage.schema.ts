import { NodeComponent } from "../../../types"

const SLACK_SCHEDULE_MESSAGE_METADATA = {
  key: "slack_action_schedule_message",
  name: "Schedule Message",
  description: "Schedule a message to be sent at a specific time"
}

export const scheduleMessageActionSchema: NodeComponent = {
  type: SLACK_SCHEDULE_MESSAGE_METADATA.key,
  title: SLACK_SCHEDULE_MESSAGE_METADATA.name,
  description: SLACK_SCHEDULE_MESSAGE_METADATA.description,
  icon: "Clock" as any, // Will be resolved in index file
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
      placeholder: "Select a channel",
      description: "The channel where the message will be sent",
      tooltip: "Select the Slack channel where the message will be sent",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "scheduleType",
      label: "Schedule Type",
      type: "select",
      required: true,
      defaultValue: "specific_time",
      options: [
        { label: "Specific Date & Time", value: "specific_time" },
        { label: "Delay from Now", value: "delay" }
      ],
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Choose whether to schedule for a specific time or delay from now"
    },
    {
      name: "scheduledTime",
      label: "Scheduled Date & Time",
      type: "datetime-local",
      required: true,
      dependsOn: "channel",
      hidden: {
        $deps: ["channel", "scheduleType"],
        $condition: {
          $or: [
            { channel: { $exists: false } },
            { scheduleType: { $ne: "specific_time" } }
          ]
        }
      },
      tooltip: "Select the date and time when the message should be sent (in your local timezone)"
    },
    {
      name: "delayMinutes",
      label: "Delay (Minutes)",
      type: "number",
      required: true,
      placeholder: "30",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel", "scheduleType"],
        $condition: {
          $or: [
            { channel: { $exists: false } },
            { scheduleType: { $ne: "delay" } }
          ]
        }
      },
      tooltip: "Number of minutes to wait before sending the message (1-120 days in minutes)"
    },
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "The message content to send. Supports Slack markdown formatting."
    },
    {
      name: "threadTs",
      label: "Thread Timestamp",
      type: "text",
      required: false,
      placeholder: "1234567890.123456",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Optional: Send the scheduled message as a reply in a thread. Provide the timestamp of the parent message."
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: true,
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Find and link channel names and usernames (e.g., @username, #channel)"
    },
    {
      name: "parse",
      label: "Parse Mode",
      type: "select",
      required: false,
      defaultValue: "none",
      options: [
        { label: "None", value: "none" },
        { label: "Full", value: "full" }
      ],
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Change how messages are parsed. 'Full' enables automatic link detection and formatting."
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Enable unfurling of primarily text-based content (like URLs)"
    },
    {
      name: "unfurlMedia",
      label: "Unfurl Media",
      type: "boolean",
      defaultValue: true,
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "Enable unfurling of media content (images, videos)"
    }
  ],
  outputSchema: [
    {
      name: "scheduledMessageId",
      label: "Scheduled Message ID",
      type: "string",
      description: "Unique ID of the scheduled message (use this to cancel it later)",
      example: "Q1234567890"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message will be sent",
      example: "C1234567890"
    },
    {
      name: "postAt",
      label: "Scheduled Time (Unix)",
      type: "number",
      description: "Unix timestamp when the message will be sent",
      example: 1699891200
    },
    {
      name: "postAtFormatted",
      label: "Scheduled Time (Readable)",
      type: "string",
      description: "Human-readable scheduled time",
      example: "2024-11-13 10:00:00 AM"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the message was scheduled successfully",
      example: true
    }
  ]
}
