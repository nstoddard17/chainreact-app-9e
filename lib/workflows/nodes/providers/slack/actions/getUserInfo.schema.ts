import { NodeComponent } from "../../../types"

const SLACK_GET_USER_INFO_METADATA = {
  key: "slack_action_get_user_info",
  name: "Get User Info",
  description: "Get detailed information about a Slack user"
}

export const getUserInfoActionSchema: NodeComponent = {
  type: SLACK_GET_USER_INFO_METADATA.key,
  title: SLACK_GET_USER_INFO_METADATA.name,
  description: SLACK_GET_USER_INFO_METADATA.description,
  icon: "UserSearch" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["users:read", "users:read.email"],
  category: "Communication",
  isTrigger: false,
  testable: true,
  configSchema: [
    {
      name: "user",
      label: "User",
      type: "combobox",
      required: true,
      dynamic: "slack_users",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a user or enter user ID",
      tooltip: "Select the user or enter a user ID (e.g., U1234567890) to get information about."
    },
    {
      name: "includePresence",
      label: "Include Presence Status",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, includes the user's current presence status (active/away). Requires additional API call."
    }
  ],
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
      name: "phone",
      label: "Phone",
      type: "string",
      description: "The user's phone number",
      example: "+1-555-123-4567"
    },
    {
      name: "timezone",
      label: "Timezone",
      type: "string",
      description: "The user's timezone",
      example: "America/Los_Angeles"
    },
    {
      name: "timezoneOffset",
      label: "Timezone Offset",
      type: "number",
      description: "The user's timezone offset in seconds",
      example: -28800
    },
    {
      name: "locale",
      label: "Locale",
      type: "string",
      description: "The user's language/locale preference",
      example: "en-US"
    },
    {
      name: "profileImage",
      label: "Profile Image URL",
      type: "string",
      description: "URL to the user's profile image (512x512)",
      example: "https://avatars.slack-edge.com/..."
    },
    {
      name: "profileImage192",
      label: "Profile Image 192px",
      type: "string",
      description: "URL to 192x192 profile image",
      example: "https://avatars.slack-edge.com/..."
    },
    {
      name: "profileImage72",
      label: "Profile Image 72px",
      type: "string",
      description: "URL to 72x72 profile image",
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
      name: "isOwner",
      label: "Is Owner",
      type: "boolean",
      description: "Whether the user is a workspace owner",
      example: false
    },
    {
      name: "isPrimaryOwner",
      label: "Is Primary Owner",
      type: "boolean",
      description: "Whether the user is the primary workspace owner",
      example: false
    },
    {
      name: "isRestricted",
      label: "Is Restricted",
      type: "boolean",
      description: "Whether the user is a guest with restricted access",
      example: false
    },
    {
      name: "isUltraRestricted",
      label: "Is Ultra Restricted",
      type: "boolean",
      description: "Whether the user is a single-channel guest",
      example: false
    },
    {
      name: "isDeleted",
      label: "Is Deleted",
      type: "boolean",
      description: "Whether the user account has been deactivated",
      example: false
    },
    {
      name: "statusText",
      label: "Status Text",
      type: "string",
      description: "The user's custom status text",
      example: "In a meeting"
    },
    {
      name: "statusEmoji",
      label: "Status Emoji",
      type: "string",
      description: "The user's custom status emoji",
      example: ":calendar:"
    },
    {
      name: "statusExpiration",
      label: "Status Expiration",
      type: "string",
      description: "When the custom status expires",
      example: "2024-01-15T12:00:00Z"
    },
    {
      name: "presence",
      label: "Presence",
      type: "string",
      description: "The user's current presence (active/away)",
      example: "active"
    },
    {
      name: "updated",
      label: "Last Updated",
      type: "string",
      description: "When the user profile was last updated",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
