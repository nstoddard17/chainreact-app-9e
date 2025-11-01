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
      dynamic: "slack-workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    {
      name: "searchBy",
      label: "Search By",
      type: "select",
      required: true,
      options: [
        { value: "id", label: "User ID" },
        { value: "email", label: "Email Address" },
        { value: "username", label: "Username" },
        { value: "displayName", label: "Display Name" }
      ],
      defaultValue: "email",
      description: "The type of identifier to search by",
      tooltip: "Choose which field to use when searching for the user. Email is most reliable for finding specific users."
    },
    {
      name: "userId",
      label: "User ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.userId}} or U1234567890",
      supportsAI: true,
      description: "The Slack user ID (starts with U)",
      tooltip: "User IDs are returned by triggers and other actions. Format: U followed by numbers.",
      visibleWhen: {
        field: "searchBy",
        value: "id"
      }
    },
    {
      name: "email",
      label: "Email Address",
      type: "text",
      required: true,
      placeholder: "user@company.com",
      supportsAI: true,
      description: "The email address of the user to find",
      tooltip: "This must match the email address associated with their Slack account.",
      visibleWhen: {
        field: "searchBy",
        value: "email"
      }
    },
    {
      name: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "john.doe",
      supportsAI: true,
      description: "The username to search for (without @)",
      tooltip: "Enter the username without the @ symbol. For example, 'john.doe' not '@john.doe'.",
      visibleWhen: {
        field: "searchBy",
        value: "username"
      }
    },
    {
      name: "displayName",
      label: "Display Name",
      type: "text",
      required: true,
      placeholder: "John Doe",
      supportsAI: true,
      description: "The display name to search for",
      tooltip: "This searches the user's display name (what shows in Slack). Partial matches may be returned.",
      visibleWhen: {
        field: "searchBy",
        value: "displayName"
      }
    },
    {
      name: "includeDeleted",
      label: "Include Deleted Users",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include deactivated/deleted users in search results",
      tooltip: "When enabled, the search will also return users who have been deactivated or deleted from the workspace."
    }
  ]
}
