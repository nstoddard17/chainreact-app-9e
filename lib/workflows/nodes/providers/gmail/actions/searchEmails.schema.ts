import { NodeComponent } from "../../../types"
// Import metadata from integrations folder
// Note: These imports may need adjustment based on project structure
const GMAIL_SEARCH_EMAILS_METADATA = {
  key: "gmail_action_search_email",
  name: "Get Email",
  description: "Find emails in Gmail matching specific search criteria"
}

export const searchEmailsActionSchema: NodeComponent = {
  type: GMAIL_SEARCH_EMAILS_METADATA.key,
  title: GMAIL_SEARCH_EMAILS_METADATA.name,
  description: GMAIL_SEARCH_EMAILS_METADATA.description,
  icon: "Search" as any, // Will be resolved in index file
  providerId: "gmail",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  producesOutput: true,
  configSchema: [
    {
      name: "labels",
      label: "Folder / Label",
      type: "select",
      dynamic: "gmail_labels",
      required: true,
      loadOnMount: true,
      placeholder: "Select folders or labels",
      description: "Choose which Gmail folders/labels to search in",
      defaultOptions: [
        { value: "INBOX", label: "Inbox" },
        { value: "SENT", label: "Sent" },
        { value: "DRAFT", label: "Drafts" },
        { value: "SPAM", label: "Spam" },
        { value: "TRASH", label: "Trash" }
      ]
    },
    {
      name: "from",
      label: "From",
      type: "combobox",
      required: false,
      placeholder: "Select sender or type email address",
      dynamic: "gmail_recent_senders",
      loadOnMount: true,
      searchable: true,
      supportsVariables: true,
      description: "Filter by sender email address",
      tooltip: "Search for emails from a specific sender. Recent senders are shown by default."
    },
    {
      name: "to",
      label: "To",
      type: "combobox",
      required: false,
      placeholder: "Select recipient or type email address",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      searchable: true,
      supportsVariables: true,
      description: "Filter by recipient email address",
      tooltip: "Search for emails to a specific recipient. Recent contacts are shown by default."
    },
    {
      name: "query",
      label: "Advanced Search Query",
      type: "text",
      required: false,
      placeholder: "e.g., subject:invoice has:attachment",
      description: "Advanced Gmail search operators like 'subject:', 'has:attachment', etc.",
      tooltip: "Use Gmail search operators for advanced filtering. The 'From' and 'To' fields above will be combined with this query."
    },
    {
      name: "maxResults",
      label: "Max Messages to Fetch",
      type: "number",
      required: false,
      min: 1,
      max: 100,
      placeholder: "10",
      description: "Maximum number of messages to retrieve (1-100)",
      tooltip: "Fetching many emails may hit Gmail API rate limits. Recommended: 10-50.",
      defaultValue: 10
    },
    {
      name: "startDate",
      label: "Start Date",
      type: "date",
      required: true,
      description: "Only fetch emails after this date"
    },
    {
      name: "endDate",
      label: "End Date",
      type: "date",
      required: false,
      description: "Only fetch emails before this date"
    },
    {
      name: "includeSpamTrash",
      label: "Include Spam/Trash",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include messages from Spam and Trash folders"
    }
  ],
  outputSchema: [
    {
      name: "messages",
      label: "Messages",
      type: "array",
      description: "Array of email messages matching the search criteria"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of messages found"
    }
  ]
}