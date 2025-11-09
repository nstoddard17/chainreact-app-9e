import { NodeComponent } from "../../../types"

export const userJoinedWorkspaceTriggerSchema: NodeComponent = {
  type: "slack_trigger_user_joined_workspace",
  title: "New User Joined Workspace",
  description: "Triggers when a new user joins the workspace",
  icon: "UserPlus" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  requiredScopes: ["users:read", "users:read.email"],
  configSchema: [
    {
      name: "includeGuests",
      label: "Include Guest Users",
      type: "boolean",
      defaultValue: true,
      description: "Trigger for guest users as well as full members",
      tooltip: "When enabled, the workflow will trigger for both full members and guest users (single-channel and multi-channel guests). Disable to only trigger for full members."
    },
    {
      name: "excludeBots",
      label: "Exclude Bot Users",
      type: "boolean",
      defaultValue: true,
      description: "Don't trigger for bot users",
      tooltip: "When enabled, bot users joining the workspace will not trigger this workflow. Recommended to keep enabled."
    }
  ],
  outputSchema: [
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The unique ID of the new user",
      example: "U1234567890"
    },
    {
      name: "username",
      label: "Username",
      type: "string",
      description: "The user's username (without @)",
      example: "john.doe"
    },
    {
      name: "displayName",
      label: "Display Name",
      type: "string",
      description: "The user's display name",
      example: "John Doe"
    },
    {
      name: "realName",
      label: "Real Name",
      type: "string",
      description: "The user's real name",
      example: "John Doe"
    },
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "The user's email address",
      example: "john.doe@company.com"
    },
    {
      name: "title",
      label: "Job Title",
      type: "string",
      description: "The user's job title",
      example: "Software Engineer"
    },
    {
      name: "timezone",
      label: "Timezone",
      type: "string",
      description: "The user's timezone",
      example: "America/Los_Angeles"
    },
    {
      name: "profileImage",
      label: "Profile Image URL",
      type: "string",
      description: "URL to the user's profile image",
      example: "https://avatars.slack-edge.com/..."
    },
    {
      name: "isBot",
      label: "Is Bot",
      type: "boolean",
      description: "Whether the user is a bot",
      example: false
    },
    {
      name: "isAdmin",
      label: "Is Admin",
      type: "boolean",
      description: "Whether the user is a workspace admin",
      example: false
    },
    {
      name: "isRestricted",
      label: "Is Restricted (Multi-Channel Guest)",
      type: "boolean",
      description: "Whether the user is a multi-channel guest",
      example: false
    },
    {
      name: "isUltraRestricted",
      label: "Is Ultra Restricted (Single-Channel Guest)",
      type: "boolean",
      description: "Whether the user is a single-channel guest",
      example: false
    },
    {
      name: "joinedAt",
      label: "Joined At",
      type: "string",
      description: "When the user joined the workspace",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "teamId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the Slack workspace",
      example: "T1234567890"
    }
  ]
}
