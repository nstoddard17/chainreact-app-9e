import { NodeComponent } from "../../../types"

const SLACK_CANCEL_SCHEDULED_MESSAGE_METADATA = {
  key: "slack_action_cancel_scheduled_message",
  name: "Cancel Scheduled Message",
  description: "Cancel a previously scheduled message"
}

export const cancelScheduledMessageActionSchema: NodeComponent = {
  type: SLACK_CANCEL_SCHEDULED_MESSAGE_METADATA.key,
  title: SLACK_CANCEL_SCHEDULED_MESSAGE_METADATA.name,
  description: SLACK_CANCEL_SCHEDULED_MESSAGE_METADATA.description,
  icon: "XCircle" as any, // Will be resolved in index file
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
      description: "The channel where the scheduled message was created",
      tooltip: "Select the channel where the scheduled message was created",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "scheduledMessageId",
      label: "Scheduled Message ID",
      type: "text",
      required: true,
      placeholder: "Q1234567890",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      tooltip: "The scheduled message ID to cancel (returned when you schedule a message)"
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the scheduled message was cancelled successfully",
      example: true
    },
    {
      name: "scheduledMessageId",
      label: "Cancelled Message ID",
      type: "string",
      description: "The ID of the cancelled scheduled message",
      example: "Q1234567890"
    }
  ]
}
