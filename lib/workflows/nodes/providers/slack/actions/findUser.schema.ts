import { NodeComponent } from "../../../types"

const SLACK_FIND_USER_METADATA = {
  key: "slack_action_find_user",
  name: "Find User",
  description: "Find a Slack user by ID, username, email, or display name"
}

export const findUserActionSchema: NodeComponent = {
  type: SLACK_FIND_USER_METADATA.key,
  title: "Find User",
  description: SLACK_FIND_USER_METADATA.description,
  icon: "User" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["users:read", "users:read.email"],
  category: "Communication",
  outputSchema: [
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The unique ID of the user",
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
      name: "email",
      label: "Email",
      type: "string",
      description: "The user's email address",
      example: "john.doe@company.com"
    },
    {
      name: "realName",
      label: "Real Name",
      type: "string",
      description: "The user's real name",
      example: "John Doe"
    },
    {
      name: "title",
      label: "Title",
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
      name: "profileImage",
      label: "Profile Image URL",
      type: "string",
      description: "URL to the user's profile image",
      example: "https://avatars.slack-edge.com/..."
    }
  ],
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
      name: "user",
      label: "User",
      type: "combobox",
      dynamic: "slack_users",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or search for a user",
      description: "The Slack user to find information about",
      tooltip: "Select a user from the dropdown or search by name or email",
      supportsAI: true,
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ]
}
