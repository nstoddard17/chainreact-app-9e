import { NodeComponent } from "../../../types"

export const listUsersActionSchema: NodeComponent = {
  type: "monday_action_list_users",
  title: "List Users",
  description: "Get a list of all users in the Monday.com account",
  icon: "Users" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "users",
      label: "Users",
      type: "array",
      description: "Array of all users in the account",
      example: '[{"id": "123", "name": "John Doe", "email": "john@company.com", "is_admin": true}]'
    },
    {
      name: "count",
      label: "User Count",
      type: "number",
      description: "Total number of users",
      example: "25"
    }
  ],
  configSchema: [
    {
      name: "kind",
      label: "User Type",
      type: "select",
      required: false,
      options: [
        { label: "All Users", value: "all" },
        { label: "Non-Guests Only", value: "non_guests" },
        { label: "Guests Only", value: "guests" },
        { label: "Admins Only", value: "admins" }
      ],
      placeholder: "All users...",
      description: "Filter users by type"
    },
    {
      name: "limit",
      label: "User Limit",
      type: "number",
      required: false,
      placeholder: "100",
      description: "Maximum number of users to return (default: 100)"
    }
  ],
}
