import { NodeComponent } from "../../../types"

export const getUserActionSchema: NodeComponent = {
  type: "monday_action_get_user",
  title: "Get User",
  description: "Retrieve details of a specific user by their ID",
  icon: "User" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The unique ID of the user",
      example: "12345"
    },
    {
      name: "name",
      label: "Name",
      type: "string",
      description: "The user's full name",
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
      label: "Title",
      type: "string",
      description: "The user's job title",
      example: "Project Manager"
    },
    {
      name: "photoUrl",
      label: "Photo URL",
      type: "string",
      description: "URL to the user's profile photo",
      example: "https://cdn.monday.com/photos/..."
    },
    {
      name: "enabled",
      label: "Enabled",
      type: "boolean",
      description: "Whether the user account is enabled",
      example: "true"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the user account was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "accountId",
      label: "Account ID",
      type: "string",
      description: "The ID of the Monday.com account the user belongs to",
      example: "12345678"
    },
    {
      name: "accountName",
      label: "Account Name",
      type: "string",
      description: "The name of the Monday.com account the user belongs to",
      example: "My Company"
    }
  ],
  configSchema: [
    {
      name: "userId",
      label: "User",
      type: "select",
      dynamic: "monday_users",
      required: true,
      loadOnMount: true,
      placeholder: "Select a user...",
      description: "The user to retrieve details for",
      supportsAI: true
    }
  ],
}
