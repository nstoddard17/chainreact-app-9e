import { NodeComponent } from "../../../types"

const SLACK_LIST_USERS_METADATA = {
  key: "slack_action_list_users",
  name: "List Users",
  description: "Get a list of all users in the workspace"
}

export const listUsersActionSchema: NodeComponent = {
  type: SLACK_LIST_USERS_METADATA.key,
  title: SLACK_LIST_USERS_METADATA.name,
  description: SLACK_LIST_USERS_METADATA.description,
  icon: "Users" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["users:read", "users:read.email"],
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
      name: "includeDeleted",
      label: "Include Deleted Users",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, includes deactivated/deleted users in the results.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "includeBots",
      label: "Include Bots",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, includes bot users in the results. Disable to only show human users.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "includeGuests",
      label: "Include Guests",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, includes guest users (restricted and ultra-restricted). Disable to only show full members.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "limit",
      label: "Limit Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      tooltip: "Maximum number of users to return (1-1000). Default is 100. Use 0 for no limit (returns all users).",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "sortBy",
      label: "Sort By",
      type: "select",
      required: false,
      defaultValue: "name",
      options: [
        { label: "Name (A-Z)", value: "name" },
        { label: "Name (Z-A)", value: "name_desc" },
        { label: "Email (A-Z)", value: "email" },
        { label: "Joined Date (Newest first)", value: "joined_desc" },
        { label: "Joined Date (Oldest first)", value: "joined_asc" }
      ],
      tooltip: "How to sort the user list.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "users",
      label: "Users",
      type: "array",
      description: "Array of user objects",
      example: []
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Total number of users returned",
      example: 156
    },
    {
      name: "activeCount",
      label: "Active Users Count",
      type: "number",
      description: "Number of active (non-deleted) users",
      example: 150
    },
    {
      name: "deletedCount",
      label: "Deleted Users Count",
      type: "number",
      description: "Number of deleted users (if included)",
      example: 6
    },
    {
      name: "botCount",
      label: "Bot Count",
      type: "number",
      description: "Number of bot users (if included)",
      example: 12
    },
    {
      name: "guestCount",
      label: "Guest Count",
      type: "number",
      description: "Number of guest users (if included)",
      example: 8
    },
    {
      name: "adminCount",
      label: "Admin Count",
      type: "number",
      description: "Number of workspace admins",
      example: 5
    }
  ]
}
