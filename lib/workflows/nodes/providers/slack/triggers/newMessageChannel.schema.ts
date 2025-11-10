import { NodeComponent } from "../../../types"

export const newMessageChannelTriggerSchema: NodeComponent = {
  type: "slack_trigger_message_channels",
  title: "New Message in Public Channel",
  description: "Triggers when a message is posted to a public channel",
  icon: "MessageSquare" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
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
      type: "combobox",
      required: false,
      dynamic: "slack_public_channels",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a channel (optional)",
      description: "Optional: Filter to a specific channel. Leave empty to listen to all public channels.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
  ],
  outputSchema: [
    {
      name: "messageText",
      label: "Message Text",
      type: "string",
      description: "The content of the message"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who sent the message"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user who sent the message"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was posted"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel where the message was posted"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the message was posted"
    },
    {
      name: "threadTs",
      label: "Thread Timestamp",
      type: "string",
      description: "The timestamp of the parent message if this is in a thread"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}