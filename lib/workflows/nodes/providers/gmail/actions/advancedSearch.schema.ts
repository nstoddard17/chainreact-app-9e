import { NodeComponent } from "../../../types"

const GMAIL_ADVANCED_SEARCH_METADATA = {
  key: "gmail_action_advanced_search",
  name: "Advanced Search",
  description: "Search Gmail with advanced filters (sender, date range, attachments, read status)"
}

export const advancedSearchActionSchema: NodeComponent = {
  type: GMAIL_ADVANCED_SEARCH_METADATA.key,
  title: "Advanced Search",
  description: GMAIL_ADVANCED_SEARCH_METADATA.description,
  icon: "Search" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  producesOutput: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  category: "Communication",
  outputSchema: [
    {
      name: "emails",
      label: "Matching Emails",
      type: "array",
      description: "Array of emails matching the search criteria",
      example: [
        {
          id: "17abc123",
          subject: "Q4 Report",
          from: "john@company.com",
          date: "2024-01-15T10:30:00Z"
        }
      ]
    },
    {
      name: "totalResults",
      label: "Total Results",
      type: "number",
      description: "Total number of emails matching your search in Gmail (may be more than what was returned)",
      example: 201
    },
    {
      name: "resultCount",
      label: "Results Returned",
      type: "number",
      description: "Actual number of emails returned in this batch (limited by Max Results setting)",
      example: 10
    },
    {
      name: "nextPageToken",
      label: "Next Page Token",
      type: "string",
      description: "Pagination token - Use this to fetch more results if totalResults > resultCount. Currently not supported in workflows.",
      example: "CAUAA..."
    },
    {
      name: "query",
      label: "Search Query",
      type: "string",
      description: "The Gmail query that was executed",
      example: "from:john@company.com has:attachment after:2024/01/01"
    }
  ],
  configSchema: [
    {
      name: "searchMode",
      label: "Search Mode",
      type: "select",
      required: true,
      options: [
        { value: "filters", label: "Use Filter Fields (Easy)" },
        { value: "query", label: "Gmail Query (Advanced)" }
      ],
      defaultValue: "filters",
      description: "Choose between filter fields or custom Gmail query",
      tooltip: "Filter Fields: Build query using form fields. Gmail Query: Write custom Gmail search syntax for maximum control."
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
      description: "Email address or name of the sender",
      tooltip: "Search for emails from a specific sender. Recent senders are shown by default.",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
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
      description: "Filter emails sent to your account or aliases",
      tooltip: "Search for emails sent to your connected email address or any of your configured aliases.",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "subject",
      label: "Subject Contains",
      type: "tags",
      required: false,
      placeholder: "Type keyword and press Enter",
      supportsAI: true,
      description: "Keywords to search for in subject line (matches emails containing any of these)",
      tooltip: "Press Enter after typing each keyword to add it as a pill. Emails matching ANY of these keywords will be found (OR logic).",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
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
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "attachmentName",
      label: "Attachment Filename Contains",
      type: "text",
      required: false,
      placeholder: ".pdf",
      supportsAI: true,
      description: "Text that must appear in attachment filenames",
      tooltip: "Use file extensions like '.pdf' or partial names like 'invoice'.",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "isRead",
      label: "Read Status",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any" },
        { value: "read", label: "Read only" },
        { value: "unread", label: "Unread only" }
      ],
      defaultValue: "any",
      description: "Filter by read/unread status",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "isStarred",
      label: "Starred Status",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any" },
        { value: "starred", label: "Starred only" },
        { value: "unstarred", label: "Unstarred only" }
      ],
      defaultValue: "any",
      description: "Filter by starred status",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "dateRange",
      label: "Date Range",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any time" },
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "last_7_days", label: "Last 7 days" },
        { value: "last_30_days", label: "Last 30 days" },
        { value: "custom", label: "Custom range" }
      ],
      defaultValue: "any",
      description: "Filter by date received",
      visibleWhen: {
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "afterDate",
      label: "After Date",
      type: "date",
      required: true,
      placeholder: "2024-01-01",
      description: "Emails received after this date",
      tooltip: "Include emails from this date onward (inclusive).",
      visibleWhen: {
        field: "dateRange",
        value: "custom"
      }
    },
    {
      name: "beforeDate",
      label: "Before Date",
      type: "date",
      required: false,
      placeholder: "2024-12-31",
      description: "Emails received before this date (optional)",
      tooltip: "Include emails up to this date (inclusive). Leave empty for no end date.",
      visibleWhen: {
        field: "dateRange",
        value: "custom"
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
        field: "searchMode",
        value: "filters"
      }
    },
    {
      name: "customQuery",
      label: "Gmail Search Query",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: "from:john@company.com has:attachment after:2024/01/01",
      supportsAI: true,
      description: "Gmail search query using Gmail's search operators",
      tooltip: "Use Gmail's advanced search syntax. Examples: 'is:unread from:john@company.com', 'has:attachment larger:5M', 'subject:(invoice OR receipt) after:2024/01/01'. See Gmail search operators documentation.",
      visibleWhen: {
        field: "searchMode",
        value: "query"
      }
    },
    {
      name: "maxResults",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 10,
      min: 1,
      max: 100,
      placeholder: "10",
      description: "Maximum number of emails to return (1-100)",
      tooltip: "Fetching many emails takes time and may hit Gmail API rate limits. Recommended: 10-50. For large batches, expect some emails to fail due to rate limiting."
    },
    {
      name: "includeSpam",
      label: "Include Spam/Trash",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include emails in spam and trash folders",
      tooltip: "By default, spam and trash are excluded from search results."
    }
  ]
}
