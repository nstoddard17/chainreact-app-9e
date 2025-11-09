import { NodeComponent } from "../../../types"

export const newGroupDirectMessageTriggerSchema: NodeComponent = {
  type: "slack_trigger_message_mpim",
  title: "New Group Direct Message",
  description: "Triggers when a message is sent in a group direct message (multi-person DM)",
  icon: "MessageSquare" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "groupId",
      label: "Group DM (Optional)",
      type: "select",
      required: false,
      dynamic: "slack_group_dms",
      description: "Optional: Filter to a specific group DM. Leave empty to receive messages from all group DMs."
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
      description: "The display name of the user"
    },
    {
      name: "channelId",
      label: "Group DM ID",
      type: "string",
      description: "The ID of the group direct message channel"
    },
    {
      name: "members",
      label: "Group Members",
      type: "array",
      description: "Array of user IDs in the group DM"
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
