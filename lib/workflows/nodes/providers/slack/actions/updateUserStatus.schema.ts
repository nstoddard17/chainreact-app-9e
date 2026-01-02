import { NodeComponent } from "../../../types"

const SLACK_UPDATE_USER_STATUS_METADATA = {
  key: "slack_action_update_user_status",
  name: "Update User Status",
  description: "Update the authenticated user's custom status"
}

export const updateUserStatusActionSchema: NodeComponent = {
  type: SLACK_UPDATE_USER_STATUS_METADATA.key,
  title: SLACK_UPDATE_USER_STATUS_METADATA.name,
  description: SLACK_UPDATE_USER_STATUS_METADATA.description,
  icon: "UserCircle" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["users.profile:write"],
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
      defaultValue: true,
      description: "This action MUST be executed as a user (not the bot). Requires reconnecting Slack with user permissions.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "statusText",
      label: "Status Text",
      type: "text",
      required: false,
      placeholder: "In a meeting",
      supportsAI: true,
      maxLength: 100,
      tooltip: "The status text to display (max 100 characters). Leave empty to clear the status.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "statusEmoji",
      label: "Status Emoji",
      type: "text",
      required: false,
      placeholder: ":calendar:",
      supportsAI: true,
      tooltip: "The emoji to display with the status (e.g., :calendar:, :coffee:, :house:). Must include colons. Leave empty for no emoji.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "statusExpiration",
      label: "Status Expiration",
      type: "select",
      required: false,
      options: [
        { label: "Don't clear (manual)", value: "0" },
        { label: "30 minutes", value: "30" },
        { label: "1 hour", value: "60" },
        { label: "2 hours", value: "120" },
        { label: "4 hours", value: "240" },
        { label: "Today (end of day)", value: "today" },
        { label: "This week (end of week)", value: "week" },
        { label: "Custom (minutes)", value: "custom" }
      ],
      defaultValue: "0",
      tooltip: "When the status should automatically clear. Select 'Custom' to enter a specific number of minutes.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "customExpiration",
      label: "Custom Expiration (minutes)",
      type: "number",
      required: false,
      placeholder: "90",
      supportsAI: true,
      tooltip: "Number of minutes until the status expires. Only used when 'Custom' is selected above.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      },
      visibleWhen: {
        field: "statusExpiration",
        value: "custom"
      }
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the status was updated successfully"
    },
    {
      name: "statusText",
      label: "Status Text",
      type: "string",
      description: "The status text that was set",
      example: "In a meeting"
    },
    {
      name: "statusEmoji",
      label: "Status Emoji",
      type: "string",
      description: "The emoji that was set",
      example: ":calendar:"
    },
    {
      name: "statusExpiration",
      label: "Expiration Timestamp",
      type: "string",
      description: "When the status will expire (Unix timestamp or ISO date)",
      example: "2024-01-15T12:00:00Z"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "When the status was updated",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
