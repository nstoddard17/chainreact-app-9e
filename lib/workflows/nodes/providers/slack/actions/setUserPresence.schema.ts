import { NodeComponent } from "../../../types"

const SLACK_SET_USER_PRESENCE_METADATA = {
  key: "slack_action_set_user_presence",
  name: "Set User Presence",
  description: "Set the authenticated user's presence (active/away)"
}

export const setUserPresenceActionSchema: NodeComponent = {
  type: SLACK_SET_USER_PRESENCE_METADATA.key,
  title: SLACK_SET_USER_PRESENCE_METADATA.name,
  description: SLACK_SET_USER_PRESENCE_METADATA.description,
  icon: "Activity" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["users:write"],
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
      name: "presence",
      label: "Presence",
      type: "select",
      required: true,
      options: [
        { label: "Active (online)", value: "auto" },
        { label: "Away", value: "away" }
      ],
      defaultValue: "auto",
      tooltip: "Set your presence to active (online) or away. Active shows a green dot, away shows no indicator.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the presence was set successfully"
    },
    {
      name: "presence",
      label: "Presence",
      type: "string",
      description: "The presence that was set (active or away)",
      example: "active"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "When the presence was updated",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
