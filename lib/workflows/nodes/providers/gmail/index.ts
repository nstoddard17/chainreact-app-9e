import { Mail, Search } from "lucide-react"
import { NodeComponent } from "../../types"

// Import Gmail action metadata - using relative paths since @/ alias may not work here
// These imports are from the integrations folder at the root
const GMAIL_SEND_EMAIL_METADATA = { key: "gmail_action_send_email", name: "Send Gmail Message", description: "Compose and send an email through your Gmail account" }
const GMAIL_ADD_LABEL_METADATA = { key: "gmail_action_add_label", name: "Apply Gmail Labels", description: "Add one or more labels to incoming Gmail messages from a specific email address" }
const GMAIL_SEARCH_EMAILS_METADATA = { key: "gmail_action_search_email", name: "Fetch Gmail Message", description: "Find emails in Gmail matching specific search criteria" }

export const gmailNodes: NodeComponent[] = [
  {
    type: "gmail_trigger_new_email",
    title: "New Email",
    description: "Triggers when a new email is received.",
    isTrigger: true,
    providerId: "gmail",
    category: "Email",
    triggerType: 'webhook',
    producesOutput: true,
    configSchema: [
      { name: "from", label: "From", type: "email-autocomplete", dynamic: "gmail-recent-recipients", placeholder: "Optional: filter by sender", description: "Filter emails by sender address" },
      { name: "subject", label: "Subject", type: "text", placeholder: "Optional: filter by subject", description: "Filter emails by subject line" },
      { name: "hasAttachment", label: "Has Attachment", type: "select", options: ["any", "yes", "no"], defaultValue: "any", description: "Filter emails based on attachment presence" },
    ],
    payloadSchema: {
      id: "The unique ID of the email.",
      threadId: "The ID of the email thread.",
      labelIds: "An array of label IDs applied to the email.",
      snippet: "A short snippet of the email's content.",
      from: "The sender's email address.",
      to: "The recipient's email address.",
      subject: "The subject of the email.",
      body: "The full body of the email (HTML or plain text).",
      attachments: "An array of attachment objects, if any.",
      receivedAt: "The timestamp when the email was received.",
    },
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
  },
  {
    type: GMAIL_SEND_EMAIL_METADATA.key,
    title: "Send Email",
    description: GMAIL_SEND_EMAIL_METADATA.description,
    icon: Mail,
    isTrigger: false,
    providerId: "gmail",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/contacts.readonly"],
    category: "Email",
    outputSchema: [
      {
        name: "messageId",
        label: "Message ID", 
        type: "string",
        description: "Unique identifier for the sent email",
        example: "17c123456789abcd"
      },
      {
        name: "to",
        label: "To Recipients",
        type: "array",
        description: "List of email addresses the message was sent to",
        example: ["user@example.com", "another@example.com"]
      },
      {
        name: "subject",
        label: "Subject",
        type: "string", 
        description: "The email subject line",
        example: "Your order confirmation"
      },
      {
        name: "timestamp",
        label: "Sent Time",
        type: "string",
        description: "When the email was sent (ISO 8601 format)",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the email was sent successfully",
        example: true
      }
    ],
    configSchema: [
      { 
        name: "to", 
        label: "To", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: true,
        placeholder: "Select recipient email address..."
      },
      { 
        name: "cc", 
        label: "CC", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        placeholder: "Select CC email address..."
      },
      { 
        name: "bcc", 
        label: "BCC", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        placeholder: "Select BCC email address..."
      },
      { name: "subject", label: "Subject", type: "text", placeholder: "Email subject", required: true, description: "Subject line of the email" },
      { name: "body", label: "Body", type: "email-rich-text", required: true, placeholder: "Compose your email message...", provider: "gmail", description: "Email message content with rich text formatting" },
      { 
        name: "attachments", 
        label: "Attachments", 
        type: "file", 
        required: false,
        placeholder: "Select files to attach", 
        multiple: true,
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
        maxSize: 25 * 1024 * 1024, // 25MB limit (Gmail's attachment limit)
        description: "Attach files from your computer or select files from previous workflow nodes"
      },
    ],
    actionParamsSchema: {
      to: "The email address of the primary recipient.",
      cc: "Comma-separated list of CC recipients.",
      bcc: "Comma-separated list of BCC recipients.",
      subject: "The subject line of the email.",
      body: "The email content, which can be plain text or HTML.",
      signature: "Email signature to append to the message.",
      attachments: "Files to be included as attachments.",
    },
  },
  {
    type: GMAIL_ADD_LABEL_METADATA.key,
    title: GMAIL_ADD_LABEL_METADATA.name,
    description: GMAIL_ADD_LABEL_METADATA.description,
    icon: Mail,
    providerId: "gmail",
    category: "Email",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
    configSchema: [
      { 
        name: "email", 
        label: "From", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: true,
        description: "Add labels to incoming emails from this email address",
        placeholder: "Select sender email address..."
      },
      { 
        name: "labelIds", 
        label: "Labels", 
        type: "select", 
        dynamic: "gmail_labels",
        required: true,
        placeholder: "Select one or more labels or type to create new ones",
        description: "Choose from your Gmail labels or type new label names to create them",
        multiple: true,
        creatable: true, // Allow custom label entry
        createNewText: "Create new label:",
        showManageButton: true // Show button to manage Gmail labels
      },
    ],
  },
  {
    type: GMAIL_SEARCH_EMAILS_METADATA.key,
    title: GMAIL_SEARCH_EMAILS_METADATA.name,
    description: GMAIL_SEARCH_EMAILS_METADATA.description,
    icon: Search,
    providerId: "gmail",
    category: "Email",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    producesOutput: true,
    configSchema: [
      // Basic Tab Fields
      { 
        name: "labels", 
        label: "Folder / Label", 
        type: "select", 
        dynamic: "gmail_labels",
        required: false,
        multiple: true,
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
        name: "query", 
        label: "Search Query", 
        type: "text",
        required: false,
        placeholder: "e.g., from:bob@example.com has:attachment",
        description: "Use Gmail search operators like 'from:', 'to:', 'subject:', 'has:attachment', etc."
      },
      { 
        name: "maxResults", 
        label: "Max Messages to Fetch", 
        type: "number",
        required: false,
        placeholder: "10",
        description: "Maximum number of messages to retrieve (between 1-15)",
        defaultValue: 10,
        min: 1,
        max: 15
      },
      {
        name: "startDate",
        label: "Start Date",
        type: "date",
        required: false,
        description: "Only fetch emails after this date"
      },
      {
        name: "endDate",
        label: "End Date",
        type: "date",
        required: false,
        description: "Only fetch emails before this date"
      },
      
      // Advanced Tab Fields
      {
        name: "format",
        label: "Format",
        type: "select",
        required: false,
        description: "Controls the amount of detail returned per message",
        options: [
          { value: "full", label: "Full (all message details)" },
          { value: "metadata", label: "Metadata (headers only)" },
          { value: "minimal", label: "Minimal (basic info only)" },
          { value: "raw", label: "Raw (RFC 2822 format)" }
        ],
        defaultValue: "full",
        advanced: true
      },
      {
        name: "includeSpamTrash",
        label: "Include Spam and Trash",
        type: "boolean",
        required: false,
        description: "Include messages from spam and trash folders",
        defaultValue: false,
        advanced: true
      },
      { 
        name: "labelFilters", 
        label: "Label Filters", 
        type: "select", 
        dynamic: "gmail_labels",
        required: false,
        multiple: true,
        placeholder: "Filter by specific labels",
        description: "Only fetch emails with these specific labels",
        advanced: true
      },
      {
        name: "threadId",
        label: "Thread ID",
        type: "text",
        required: false,
        description: "Fetch all messages from a specific conversation thread",
        placeholder: "Enter thread ID",
        advanced: true
      },
      {
        name: "fieldsMask",
        label: "Fields Mask",
        type: "select",
        required: false,
        description: "Specify which fields to include in the response",
        options: [
          { value: "messages(id,snippet)", label: "ID + Snippet" },
          { value: "messages(id,payload(headers))", label: "Metadata Only" },
          { value: "messages(id,payload(body))", label: "Body" },
          { value: "messages(id,payload(body),payload(parts))", label: "Body + Attachments" },
          { value: "messages(id,payload(parts))", label: "Attachments" },
          { value: "messages", label: "Full Message" },
          { value: "custom", label: "Custom Fields Mask" }
        ],
        defaultValue: "messages",
        advanced: true
      },
      {
        name: "customFieldsMask",
        label: "Custom Fields Mask",
        type: "text",
        required: false,
        description: "Enter custom fields mask (only used when Fields Mask is set to 'Custom')",
        placeholder: "e.g., messages(id,threadId,snippet,payload)",
        dependsOn: "fieldsMask",
        advanced: true
      },
      
      // Legacy fields - keeping for backward compatibility but hidden from UI
      { 
        name: "emailAddress", 
        label: "Search by Email Address", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: false,
        multiple: true,
        placeholder: "Enter email addresses...",
        description: "Choose from recent recipients or type custom email addresses",
        hidden: true
      },
      { 
        name: "quantity", 
        label: "Number of Emails", 
        type: "select",
        required: false,
        placeholder: "Select how many emails to fetch",
        description: "Choose how many recent emails to fetch from these senders",
        options: [
          { value: "1", label: "Most recent email" },
          { value: "5", label: "Last 5 emails" },
          { value: "10", label: "Last 10 emails" },
          { value: "20", label: "Last 20 emails" },
          { value: "50", label: "Last 50 emails" },
          { value: "100", label: "Last 100 emails" },
          { value: "all", label: "All emails" }
        ],
        defaultValue: "1",
        hidden: true
      },
      {
        name: "includeBody",
        label: "Include Email Body",
        type: "boolean",
        required: false,
        description: "Include full email body content in results",
        defaultValue: false,
        hidden: true
      },
      {
        name: "includeAttachments",
        label: "Include Attachments Info",
        type: "boolean",
        required: false,
        description: "Include attachment information in results",
        defaultValue: false,
        hidden: true
      },
      { 
        name: "labelIds", 
        label: "Filter by Labels", 
        type: "select", 
        dynamic: "gmail_labels",
        required: false,
        multiple: true,
        placeholder: "Select labels to filter by",
        description: "Only fetch emails with these labels",
        hidden: true
      },
    ],
  },
]