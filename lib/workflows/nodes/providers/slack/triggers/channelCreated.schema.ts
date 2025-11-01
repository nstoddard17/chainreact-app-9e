import { NodeComponent } from "../../../types"

export const channelCreatedTriggerSchema: NodeComponent = {
  type: "slack_trigger_channel_created",
  title: "Channel Created",
  description: "Triggers when a new channel is created in the workspace",
  icon: "Hash" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "channelType",
      label: "Channel Type",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Channels" },
        { value: "public", label: "Public Channels Only" },
        { value: "private", label: "Private Channels Only" }
      ],
      description: "Filter by channel type"
    },
  ],
  outputSchema: [
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The unique ID of the newly created channel"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel (without # prefix)"
    },
    {
      name: "isPrivate",
      label: "Is Private",
      type: "boolean",
      description: "Whether the channel is private"
    },
    {
      name: "creatorId",
      label: "Creator User ID",
      type: "string",
      description: "The ID of the user who created the channel"
    },
    {
      name: "creatorName",
      label: "Creator Name",
      type: "string",
      description: "The display name of the user who created the channel"
    },
    {
      name: "purpose",
      label: "Channel Purpose",
      type: "string",
      description: "The purpose/description of the channel"
    },
    {
      name: "topic",
      label: "Channel Topic",
      type: "string",
      description: "The topic of the channel"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "When the channel was created"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}
