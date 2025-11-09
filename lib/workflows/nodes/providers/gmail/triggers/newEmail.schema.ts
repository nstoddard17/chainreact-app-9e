import { NodeComponent } from "../../../types"

export const newEmailTriggerSchema: NodeComponent = {
  type: "gmail_trigger_new_email",
  title: "New Email",
  description: "Triggers when a new email is received. Supports AI-powered semantic filtering to trigger on emails about specific topics.",
  isTrigger: true,
  providerId: "gmail",
  category: "Communication",
  icon: "Mail" as any, // Will be resolved in index file
  producesOutput: true,
  configSchema: [
    {
      name: "from",
      label: "From",
      type: "select",
      dynamic: "gmail_recent_senders",
      required: false,
      loadOnMount: true, // Load senders immediately when modal opens
      placeholder: "Leave blank for any sender",
      description: "Filter by sender email address. Shows recent senders and your contacts grouped by category.",
      tooltip: "Leave blank to trigger on emails from ANY sender"
    },
    {
      name: "subject",
      label: "Subject",
      type: "text",
      placeholder: "Leave blank for any subject",
      description: "Filter by keywords in subject line. For semantic matching (e.g., 'about returns'), use AI Content Filter below instead."
    },
    {
      name: "subjectExactMatch",
      label: "Exact match",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Match the subject exactly (case-insensitive). Turn off to match emails that contain the subject text anywhere in the subject line."
    },
    {
      name: "hasAttachment",
      label: "Has Attachment",
      type: "select",
      options: ["any", "yes", "no"],
      defaultValue: "any",
      description: "Filter emails based on attachment presence"
    },
    {
      name: "labelIds",
      label: "Folder",
      type: "select",
      dynamic: "gmail_labels",
      required: false,
      multiple: true,
      loadOnMount: true,
      defaultValue: ["INBOX"],
      placeholder: "Inbox (default)",
      description: "Select one or more Gmail folders to monitor for new emails. Defaults to INBOX if not specified.",
      tooltip: "Choose which Gmail folders to monitor. You can select multiple folders to watch for new emails across different labels.",
      defaultOptions: [
        { value: "INBOX", label: "Inbox" },
        { value: "SENT", label: "Sent" },
        { value: "DRAFT", label: "Drafts" },
        { value: "SPAM", label: "Spam" },
        { value: "TRASH", label: "Trash" }
      ]
    },
    {
      name: "aiContentFilter",
      label: "AI Content Filter (Optional)",
      type: "textarea",
      required: false,
      placeholder: "e.g., 'emails about our return policy' or 'customer complaints about shipping'",
      description: "🤖 Use AI to filter emails by meaning and context, not just keywords. Describe what the email should be about. Leave blank to trigger on any email matching the filters above.",
      rows: 3
    },
    {
      name: "aiFilterConfidence",
      label: "AI Filter Strictness",
      type: "select",
      required: false,
      defaultValue: "medium",
      options: [
        { value: "low", label: "Relaxed (50%+ match)" },
        { value: "medium", label: "Balanced (70%+ match)" },
        { value: "high", label: "Strict (90%+ match)" }
      ],
      description: "How closely must the email match your AI content filter? Only used if AI Content Filter is set.",
      dependsOn: "aiContentFilter",
      hidden: {
        $deps: ["aiContentFilter"],
        $condition: { aiContentFilter: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Email ID",
      type: "string",
      description: "The unique ID of the email"
    },
    {
      name: "threadId",
      label: "Thread ID",
      type: "string",
      description: "The ID of the email thread"
    },
    {
      name: "from",
      label: "From",
      type: "string",
      description: "The sender's email address"
    },
    {
      name: "to",
      label: "To",
      type: "string",
      description: "The recipient's email address"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject of the email"
    },
    {
      name: "body",
      label: "Body",
      type: "string",
      description: "The full body of the email"
    },
    {
      name: "snippet",
      label: "Snippet",
      type: "string",
      description: "A short snippet of the email's content"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "array",
      description: "An array of attachment objects"
    },
    {
      name: "receivedAt",
      label: "Received At",
      type: "string",
      description: "The timestamp when the email was received"
    }
  ],
}
