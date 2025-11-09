import { NodeComponent } from "../../../types"

const SLACK_ADD_REMINDER_METADATA = {
  key: "slack_action_add_reminder",
  name: "Add Reminder",
  description: "Create a reminder for a user in Slack"
}

export const addReminderActionSchema: NodeComponent = {
  type: SLACK_ADD_REMINDER_METADATA.key,
  title: "Add Reminder",
  description: SLACK_ADD_REMINDER_METADATA.description,
  icon: "Bell" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["reminders:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "reminderId",
      label: "Reminder ID",
      type: "string",
      description: "The unique ID of the created reminder",
      example: "Rm1234567890"
    },
    {
      name: "text",
      label: "Reminder Text",
      type: "string",
      description: "The reminder message",
      example: "Follow up on project status"
    },
    {
      name: "time",
      label: "Reminder Time",
      type: "string",
      description: "When the reminder will fire",
      example: "2024-01-15T15:00:00Z"
    },
    {
      name: "user",
      label: "User ID",
      type: "string",
      description: "The user who will receive the reminder",
      example: "U1234567890"
    },
    {
      name: "recurring",
      label: "Is Recurring",
      type: "boolean",
      description: "Whether this is a recurring reminder",
      example: false
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the reminder was created successfully",
      example: true
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
      name: "text",
      label: "Reminder Text",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: "Follow up on project status...",
      supportsAI: true,
      description: "What to remind the user about",
      tooltip: "Keep it clear and actionable. This is the message the user will see when the reminder fires."
    },
    {
      name: "timeType",
      label: "Time Type",
      type: "select",
      required: true,
      options: [
        { value: "relative", label: "Relative (in X minutes/hours/days)" },
        { value: "absolute", label: "Absolute (specific date and time)" },
        { value: "natural", label: "Natural Language (tomorrow at 2pm, next Monday, etc.)" }
      ],
      defaultValue: "relative",
      description: "How to specify when the reminder should fire",
      tooltip: "Relative: '30 minutes', '2 hours', '1 day'. Absolute: specific timestamp. Natural: 'tomorrow at 2pm', 'next Monday'."
    },
    {
      name: "relativeTime",
      label: "Time from Now",
      type: "number",
      required: true,
      min: 1,
      placeholder: "30",
      description: "How long from now (in selected units)",
      visibleWhen: {
        field: "timeType",
        value: "relative"
      }
    },
    {
      name: "relativeUnit",
      label: "Time Unit",
      type: "select",
      required: true,
      options: [
        { value: "minutes", label: "Minutes" },
        { value: "hours", label: "Hours" },
        { value: "days", label: "Days" },
        { value: "weeks", label: "Weeks" }
      ],
      defaultValue: "minutes",
      description: "Unit of time",
      visibleWhen: {
        field: "timeType",
        value: "relative"
      }
    },
    {
      name: "absoluteTime",
      label: "Reminder Date & Time",
      type: "datetime-local",
      required: true,
      placeholder: "2024-01-15T15:00",
      description: "When to send the reminder",
      tooltip: "Must be a future date and time. Time is in your local timezone.",
      visibleWhen: {
        field: "timeType",
        value: "absolute"
      }
    },
    {
      name: "naturalTime",
      label: "Natural Language Time",
      type: "text",
      required: true,
      placeholder: "tomorrow at 2pm, next Monday, in 30 minutes",
      supportsAI: true,
      description: "Describe when to send the reminder in natural language",
      tooltip: "Examples: 'tomorrow at 2pm', 'next Monday at 9am', 'in 30 minutes', 'on Friday'. Slack will interpret this.",
      visibleWhen: {
        field: "timeType",
        value: "natural"
      }
    },
    {
      name: "userType",
      label: "Remind Who",
      type: "select",
      required: true,
      options: [
        { value: "me", label: "Myself (authenticated user)" },
        { value: "specific", label: "Specific User" }
      ],
      defaultValue: "me",
      description: "Who should receive this reminder",
      tooltip: "You can only set reminders for yourself or users in your workspace."
    },
    {
      name: "userId",
      label: "User",
      type: "select",
      dynamic: "slack_users",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a user...",
      description: "The user to remind",
      tooltip: "This user must be in your Slack workspace.",
      visibleWhen: {
        field: "userType",
        value: "specific"
      }
    },
    {
      name: "recurring",
      label: "Recurring Reminder",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Make this a recurring reminder",
      tooltip: "Only works with natural language time (e.g., 'every Monday at 9am', 'every weekday at 10am')."
    }
  ]
}
