import { NodeComponent } from "../../../types"

export const newDirectMessageTriggerSchema: NodeComponent = {
  type: "slack_trigger_message_im",
  title: "New Direct Message",
  description: "Triggers when a direct message is sent to the bot",
  icon: "MessageSquare" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "user",
      label: "From User",
      type: "combobox",
      required: false,
      dynamic: "slack_users",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a user (optional)",
      description: "Optional: Filter to messages from a specific user. Leave empty to receive all direct messages."
    },
  ],
  outputSchema: [
    {
      name: "messageText",
      label: "Message Text",
      type: "string",
      description: "The content of the direct message"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who sent the direct message"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user"
    },
    {
      name: "userEmail",
      label: "User Email",
      type: "string",
      description: "The email address of the user (if available)"
    },
    {
      name: "channelId",
      label: "DM Channel ID",
      type: "string",
      description: "The ID of the direct message channel"
    },
    {
      name: "timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the message was sent"
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
