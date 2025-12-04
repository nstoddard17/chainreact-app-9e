import { Users, User } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Granular Notion User Actions
 * Each action is focused on a single user operation
 */

export const notionUserActions: NodeComponent[] = [
  // ============= LIST USERS =============
  {
    type: "notion_action_list_users",
    title: "List Users",
    description: "List all users in your Notion workspace",
    icon: Users,
    providerId: "notion",
    requiredScopes: ["users.read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace",
        loadOnMount: true
      },
      {
        name: "includeGuests",
        label: "Include Guests",
        type: "select",
        defaultValue: "true",
        clearable: false,
        options: [
          { value: "true", label: "Yes, include guests" },
          { value: "false", label: "No, members only" }
        ],
        description: "Whether to include guest users in the results",
        dependsOn: "workspace",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      },
      {
        name: "pageSize",
        label: "Page Size",
        type: "number",
        required: false,
        defaultValue: 100,
        min: 1,
        max: 100,
        placeholder: "100",
        description: "Number of users to return (max 100)",
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
        description: "Array of users in the workspace"
      },
      {
        name: "has_more",
        label: "Has More",
        type: "boolean",
        description: "Whether there are more users to load"
      },
      {
        name: "next_cursor",
        label: "Next Cursor",
        type: "string",
        description: "Cursor for retrieving next page"
      },
      {
        name: "total_count",
        label: "Total Count",
        type: "number",
        description: "Number of users returned in this page"
      }
    ]
  },

  // ============= GET USER =============
  {
    type: "notion_action_get_user",
    title: "Get User Details",
    description: "Retrieve detailed information about a specific user",
    icon: User,
    providerId: "notion",
    requiredScopes: ["users.read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace",
        loadOnMount: true
      },
      {
        name: "userId",
        label: "User",
        type: "select",
        dynamic: "notion_users",
        required: true,
        placeholder: "Select a user",
        description: "The user to retrieve details for",
        dependsOn: "workspace",
        hidden: {
          $deps: ["workspace"],
          $condition: { workspace: { $exists: false } }
        }
      }
    ],
    outputSchema: [
      {
        name: "user_id",
        label: "User ID",
        type: "string",
        description: "The unique ID of the user"
      },
      {
        name: "name",
        label: "Name",
        type: "string",
        description: "The user's name"
      },
      {
        name: "email",
        label: "Email",
        type: "string",
        description: "The user's email address"
      },
      {
        name: "avatar_url",
        label: "Avatar URL",
        type: "string",
        description: "URL of the user's avatar image"
      },
      {
        name: "type",
        label: "User Type",
        type: "string",
        description: "Type of user (person or bot)"
      },
      {
        name: "user",
        label: "Full User Object",
        type: "object",
        description: "Complete user object with all details"
      }
    ]
  }
]
