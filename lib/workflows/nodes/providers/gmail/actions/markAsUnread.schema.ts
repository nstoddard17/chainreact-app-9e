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
  producesOutput: true,
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
      name: "from",
      label: "From (Sender)",
      type: "combobox",
      required: false,
      placeholder: "Select sender or type email address",
      dynamic: "gmail_recent_senders",
      loadOnMount: true,
      searchable: true,
      supportsVariables: true,
      supportsAI: true,
      description: "Filter by sender email address",
      tooltip: "Search for messages from a specific sender. Recent senders are shown by default.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "to",
      label: "To (Recipient)",
      type: "combobox",
      required: false,
      placeholder: "Select your email or alias",
      dynamic: "gmail_from_addresses",
      loadOnMount: true,
      searchable: true,
      supportsVariables: true,
      supportsAI: true,
      description: "Filter by recipient (your email addresses)",
      tooltip: "Search for messages sent to your connected email address or any of your configured aliases.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "subjectKeywords",
      label: "Subject Keywords",
      type: "tags",
      required: false,
      placeholder: "Type keyword and press Enter...",
      supportsAI: true,
      description: "Keywords to search for in subject line (type and press Enter to add multiple)",
      tooltip: "Add one or more keywords. Messages matching these keywords in the subject will be found.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "bodyKeywords",
      label: "Body Keywords",
      type: "tags",
      required: false,
      placeholder: "Type keyword and press Enter...",
      supportsAI: true,
      description: "Keywords to search for in message body (type and press Enter to add multiple)",
      tooltip: "Add one or more keywords. Messages containing these keywords in the body will be found.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "keywordMatchType",
      label: "Keyword Match Type",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Match any keyword" },
        { value: "all", label: "Match all keywords" }
      ],
      defaultValue: "any",
      description: "How to match multiple keywords",
      tooltip: "Choose whether messages must match ANY keyword or ALL keywords.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "hasAttachment",
      label: "Has Attachment",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any (with or without)" },
        { value: "yes", label: "Must have attachment" },
        { value: "no", label: "Must not have attachment" }
      ],
      defaultValue: "any",
      description: "Filter by attachment presence",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "hasLabel",
      label: "Label",
      type: "select",
      dynamic: "gmail-labels",
      required: false,
      loadOnMount: true,
      placeholder: "Select a label...",
      description: "Filter by Gmail label",
      tooltip: "Only include emails with this label applied.",
      visibleWhen: {
        field: "messageSelection",
        value: "search"
      }
    },
    {
      name: "isUnread",
      label: "Read Status",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any" },
        { value: "unread", label: "Unread only" },
        { value: "read", label: "Read only" }
      ],
      defaultValue: "read",
      description: "Filter by read/unread status",
      tooltip: "Typically you'll want 'Read only' to avoid marking already-unread messages.",
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
