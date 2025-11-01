import { NodeComponent } from "../../../types"

export const slashCommandTriggerSchema: NodeComponent = {
  type: "slack_trigger_slash_command",
  title: "Slash Command",
  description: "Triggers when a custom slash command is used (requires Slack app configuration)",
  icon: "Terminal" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "command",
      label: "Command",
      type: "text",
      required: true,
      placeholder: "/mycommand",
      description: "The slash command to listen for (must start with /). This command must be registered in your Slack app settings."
    },
    {
      name: "responseType",
      label: "Response Type",
      type: "select",
      required: false,
      defaultValue: "ephemeral",
      options: [
        { value: "ephemeral", label: "Ephemeral (only visible to user)" },
        { value: "in_channel", label: "In Channel (visible to everyone)" }
      ],
      description: "How the response should be displayed"
    },
  ],
  outputSchema: [
    {
      name: "command",
      label: "Command",
      type: "string",
      description: "The slash command that was used"
    },
    {
      name: "text",
      label: "Command Text",
      type: "string",
      description: "The text entered after the command"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who used the command"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the user"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the command was used"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel"
    },
    {
      name: "responseUrl",
      label: "Response URL",
      type: "string",
      description: "URL to send delayed responses to the command"
    },
    {
      name: "triggerId",
      label: "Trigger ID",
      type: "string",
      description: "ID that can be used to open modals in response to the command"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace"
    }
  ],
}
