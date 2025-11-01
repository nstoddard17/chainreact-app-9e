import { NodeComponent } from "../../../types"

const GMAIL_MARK_AS_UNREAD_METADATA = {
  key: "gmail_action_mark_as_unread",
  name: "Mark as Unread",
  description: "Mark one or more Gmail messages as unread"
}

export const markAsUnreadActionSchema: NodeComponent = {
  type: GMAIL_MARK_AS_UNREAD_METADATA.key,
  title: "Mark as Unread",
  description: GMAIL_MARK_AS_UNREAD_METADATA.description,
  icon: "Mail" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageIds",
      label: "Message IDs",
      type: "array",
      description: "IDs of messages that were marked as unread",
      example: ["17abc123", "17def456"]
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of messages marked as unread",
      example: 2
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the operation was successful",
      example: true
    },
    {
      name: "markedAt",
      label: "Marked At",
      type: "string",
      description: "When the messages were marked as unread",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "messageSelection",
      label: "Mark As Unread",
      type: "select",
      required: true,
      options: [
        { value: "single", label: "Single Message" },
        { value: "multiple", label: "Multiple Messages (by ID)" },
        { value: "search", label: "All Messages Matching Search" }
      ],
      defaultValue: "single",
      description: "Which messages to mark as unread"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}}",
      supportsAI: true,
      description: "The ID of the message to mark as unread",
      tooltip: "Get this from a Gmail trigger or search action. Useful for flagging messages that need follow-up.",
      visibleWhen: {
        field: "messageSelection",
        value: "single"
      }
    },
    {
      name: "messageIds",
      label: "Message IDs",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: "17abc123\n17def456\n17ghi789",
      supportsAI: true,
      description: "List of message IDs (one per line)",
      tooltip: "Enter one message ID per line. Maximum 1000 messages per request.",
      visibleWhen: {
        field: "messageSelection",
        value: "multiple"
      }
    },
    {
      name: "searchQuery",
      label: "Search Query",
      type: "text",
      required: true,
      placeholder: "from:important@client.com is:read",
      supportsAI: true,
      description: "Gmail search query to find messages to mark as unread",
      tooltip: "Use Gmail search syntax. All matching messages will be marked as unread. Example: 'subject:urgent is:read' to re-flag urgent emails.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "maxMessages",
      label: "Maximum Messages",
      type: "number",
      required: false,
      defaultValue: 100,
      min: 1,
      max: 1000,
      placeholder: "100",
      description: "Maximum number of messages to mark as unread (when using search)",
      tooltip: "Limits how many messages are marked as unread in a single run.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    }
  ]
}
