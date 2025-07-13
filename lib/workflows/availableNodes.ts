import { ComponentType } from "react"
import {
  Zap,
  Filter,
  GitBranch,
  Code,
  Mail,
  MessageSquare,
  Send,
  Calendar,
  File,
  Users,
  FileSpreadsheet,
  FileText,
  Plus,
  ShoppingCart,
  Database,
  Upload,
  PenSquare,
  Briefcase,
  Video,
  MailOpen,
  BarChart,
  Repeat,
  AlertTriangle,
  Edit,
  Share,
  Download,
  Hash,
  UserPlus,
  GitPullRequest,
  AlertCircle,
  Building,
  User,
  Camera,
  List,
  Move,
  DollarSign,
  CreditCard,
  FolderPlus,
  Trash2,
  Search,
  Layout,
  Shield,
  Package,
  Check,
  X,
  Reply,
  Forward,
  AtSign,
  MessageCircle,
  RotateCcw,
  Heart,
  HeartOff,
  UserMinus,
  Clock,
} from "lucide-react"

// Import Gmail action metadata
import { ACTION_METADATA as GMAIL_SEND_EMAIL_METADATA } from "@/integrations/gmail/sendEmail"
import { ACTION_METADATA as GMAIL_ADD_LABEL_METADATA } from "@/integrations/gmail/addLabel"
import { ACTION_METADATA as GMAIL_SEARCH_EMAILS_METADATA } from "@/integrations/gmail/searchEmails"

// Import new integration action metadata
import { ACTION_METADATA as SLACK_SEND_MESSAGE_METADATA } from "@/integrations/slack/sendMessage"
import { ACTION_METADATA as SLACK_CREATE_CHANNEL_METADATA } from "@/integrations/slack/createChannel"
import { ACTION_METADATA as NOTION_CREATE_PAGE_METADATA } from "@/integrations/notion/createPage"
import { ACTION_METADATA as HUBSPOT_CREATE_CONTACT_METADATA } from "@/integrations/hubspot/createContact"
import { ACTION_METADATA as GITHUB_CREATE_ISSUE_METADATA } from "@/integrations/github/createIssue"
import { ACTION_METADATA as GOOGLE_SHEETS_CREATE_ROW_METADATA } from "@/integrations/google-sheets/createRow"
import { ACTION_METADATA as AIRTABLE_CREATE_RECORD_METADATA } from "@/integrations/airtable/createRecord"

// Import AI Agent metadata
import { AI_AGENT_METADATA } from "@/lib/workflows/aiAgent"

export interface ConfigField {
  name: string
  label: string
  type: "string" | "number" | "boolean" | "select" | "combobox" | "textarea" | "text" | "email" | "password" | "email-autocomplete" | "location-autocomplete" | "file" | "date" | "time" | "datetime" | "custom" | "rich-text" | "multi-select"
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[] | string[]
  dynamic?: "slack-channels" | "slack_workspaces" | "slack_users" | "google-calendars" | "google-drive-folders" | "google-drive-files" | "onedrive-folders" | "dropbox-folders" | "box-folders" | "gmail-recent-recipients" | "gmail-enhanced-recipients" | "gmail-contact-groups" | "gmail_messages" | "gmail_labels" | "gmail_recent_senders" | "google-sheets_spreadsheets" | "google-sheets_sheets" | "google-docs_documents" | "google-docs_templates" | "google-docs_recent_documents" | "google-docs_shared_documents" | "google-docs_folders" | "youtube_channels" | "youtube_videos" | "youtube_playlists" | "teams_chats" | "teams_teams" | "teams_channels" | "github_repositories" | "gitlab_projects" | "notion_databases" | "notion_pages" | "notion_workspaces" | "notion_users" | "trello_boards" | "trello_lists" | "hubspot_companies" | "hubspot_contacts" | "hubspot_deals" | "hubspot_lists" | "hubspot_pipelines" | "hubspot_deal_stages" | "airtable_workspaces" | "airtable_bases" | "airtable_tables" | "airtable_records" | "airtable_feedback_records" | "airtable_task_records" | "airtable_project_records" | "gumroad_products" | "blackbaud_constituents" | "facebook_pages" | "onenote_notebooks" | "onenote_sections" | "onenote_pages" | "outlook_folders" | "outlook_messages" | "outlook_contacts" | "outlook_calendars" | "outlook_events" | "outlook-enhanced-recipients"
  accept?: string // For file inputs, specify accepted file types
  maxSize?: number // For file inputs, specify max file size in bytes
  defaultValue?: string | number | boolean // Default value for the field
  tableName?: string // For Airtable record fields, specify which table to fetch records from
  [key: string]: any
}

export interface NodeField {
  name: string
  label: string
  type: "text" | "textarea" | "number" | "boolean" | "select" | "combobox" | "file" | "custom" | "email" | "time" | "datetime" | "email-autocomplete" | "date" | "location-autocomplete" | "rich-text" | "multi-select"
  required?: boolean
  placeholder?: string
  defaultValue?: any
  options?: { value: string; label: string }[] | string[]
  description?: string
  dependsOn?: string
  // Additional properties used in the codebase
  accept?: string
  dynamic?: boolean | string
  maxSize?: string | number
  multiple?: boolean
  creatable?: boolean
  readonly?: boolean
  hidden?: boolean
  // New field for output data descriptions
  outputType?: "string" | "number" | "array" | "object" | "boolean"
}

export interface NodeOutputField {
  name: string
  label: string
  type: "string" | "number" | "array" | "object" | "boolean" | "file"
  description: string
  example?: any
}

export interface NodeComponent {
  type: string
  title: string
  description: string
  icon?: any
  category: string
  providerId?: string
  isTrigger?: boolean
  configSchema?: NodeField[]
  // Additional properties used in the codebase
  triggerType?: string
  payloadSchema?: any
  requiredScopes?: string[]
  actionParamsSchema?: any
  // New properties for data flow and testing
  outputSchema?: NodeOutputField[]
  testable?: boolean
  // Test function that returns sample output data
  testFunction?: (config: any) => Promise<any> | any
  // Conditional availability based on trigger
  requiresTriggerProvider?: string
  // New property to identify nodes that produce outputs suitable for AI Agent input
  producesOutput?: boolean
  // New property to mark actions as coming soon
  comingSoon?: boolean
}



export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  // Generic Triggers
  {
    type: "webhook",
    title: "Webhook",
    description: "Receive HTTP requests",
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "path", label: "Path", type: "text", placeholder: "/webhook-path" },
      { name: "method", label: "HTTP Method", type: "select", options: ["POST", "GET", "PUT"] },
    ],
  },
  {
    type: "schedule",
    title: "Schedule",
    description: "Trigger workflow on a time-based schedule",
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "cron", label: "Cron Expression", type: "text", placeholder: "0 * * * *" },
      { name: "timezone", label: "Timezone", type: "text", placeholder: "UTC" },
    ],
  },
  {
    type: "manual",
    title: "Manual",
    description: "Manually trigger a workflow",
    icon: Zap,
    category: "Triggers",
    isTrigger: true,
    producesOutput: true,
  },

  // Generic Actions
  {
    type: "filter",
    title: "Filter",
    description: "Filter data based on conditions",
    icon: Filter,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "condition", label: "Condition", type: "textarea", placeholder: "e.g., {{data.value}} > 100" },
    ],
  },
  {
    type: "if_then_condition",
    title: "If/Then",
    description: "Execute actions only if conditions are met",
    icon: GitBranch,
    category: "Productivity",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "conditionMet",
        label: "Condition Met",
        type: "boolean",
        description: "Whether the condition evaluated to true or false",
        example: true
      },
      {
        name: "conditionType",
        label: "Condition Type",
        type: "string",
        description: "The type of condition that was evaluated (simple, multiple, or advanced)",
        example: "simple"
      },
      {
        name: "evaluatedExpression",
        label: "Evaluated Expression",
        type: "string",
        description: "The condition expression that was evaluated",
        example: "{{data.status}} === 'active'"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the condition evaluation was successful",
        example: true
      }
    ],
    configSchema: [
      {
        name: "conditionType",
        label: "Condition Type",
        type: "select",
        required: true,
        defaultValue: "simple",
        options: [
          { value: "simple", label: "Simple Comparison" },
          { value: "multiple", label: "Multiple Conditions" },
          { value: "advanced", label: "Advanced Expression" }
        ],
        description: "Choose how to define your condition"
      },
      {
        name: "field",
        label: "Field to Check",
        type: "text",
        required: true,
        placeholder: "e.g., {{data.status}}, {{trigger.email}}, {{previous.result}}",
        description: "The field or variable to evaluate"
      },
      {
        name: "operator",
        label: "Operator",
        type: "select",
        required: true,
        options: [
          { value: "equals", label: "Equals (=)" },
          { value: "not_equals", label: "Not Equals (≠)" },
          { value: "greater_than", label: "Greater Than (>)" },
          { value: "less_than", label: "Less Than (<)" },
          { value: "greater_equal", label: "Greater Than or Equal (≥)" },
          { value: "less_equal", label: "Less Than or Equal (≤)" },
          { value: "contains", label: "Contains" },
          { value: "not_contains", label: "Does Not Contain" },
          { value: "starts_with", label: "Starts With" },
          { value: "ends_with", label: "Ends With" },
          { value: "is_empty", label: "Is Empty" },
          { value: "is_not_empty", label: "Is Not Empty" },
          { value: "exists", label: "Exists" },
          { value: "not_exists", label: "Does Not Exist" }
        ],
        description: "How to compare the field"
      },
      {
        name: "value",
        label: "Value to Compare",
        type: "text",
        placeholder: "e.g., 'approved', 100, {{data.threshold}}",
        description: "The value to compare against (leave empty for existence checks)"
      },
      {
        name: "logicOperator",
        label: "Logic Operator",
        type: "select",
        defaultValue: "and",
        options: [
          { value: "and", label: "AND (all conditions must be true)" },
          { value: "or", label: "OR (any condition can be true)" }
        ],
        description: "How to combine multiple conditions"
      },
      {
        name: "additionalConditions",
        label: "Additional Conditions",
        type: "custom",
        description: "Add more conditions for complex logic"
      },
      {
        name: "advancedExpression",
        label: "Advanced Expression",
        type: "textarea",
        placeholder: "e.g., {{data.score}} > 80 && {{data.status}} === 'active'",
        description: "Write a custom JavaScript expression for complex conditions"
      },
      {
        name: "continueOnFalse",
        label: "Continue Workflow if False",
        type: "boolean",
        defaultValue: false,
        description: "If unchecked, workflow stops when condition is false"
      }
    ],
  },
  {
    type: "delay",
    title: "Delay",
    description: "Pause the workflow for a specified amount of time",
    category: "Productivity",
    providerId: "logic",
    isTrigger: false,
    testable: true,
    producesOutput: true,
    outputSchema: [
      {
        name: "delayDuration",
        label: "Delay Duration",
        type: "number",
        description: "The duration of the delay in seconds",
        example: 60
      },
      {
        name: "startTime",
        label: "Start Time",
        type: "string",
        description: "When the delay started (ISO 8601 format)",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "endTime",
        label: "End Time",
        type: "string",
        description: "When the delay ended (ISO 8601 format)",
        example: "2024-01-15T10:31:00Z"
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the delay completed successfully",
        example: true
      }
    ],
    configSchema: [
      { name: "duration", label: "Duration (seconds)", type: "number", placeholder: "e.g., 60" },
    ],
  },
  {
    type: "ai_agent",
    title: "AI Agent",
    description: "An AI agent that can use other integrations as tools to accomplish goals",
    icon: Zap,
    category: "AI & Automation",
    providerId: "ai",
    isTrigger: false,
    testable: true,
    configSchema: [
      { 
        name: "inputNodeId", 
        label: "Input Node", 
        type: "select", 
        required: true,
        placeholder: "Select which node should provide input to the AI Agent..."
      },
      { 
        name: "memory", 
        label: "Memory", 
        type: "select",
        defaultValue: "all-storage",
        options: [
          { value: "none", label: "No memory (start fresh each time)" },
          { value: "single-storage", label: "One storage integration (select below)" },
          { value: "all-storage", label: "All connected storage integrations" },
          { value: "custom", label: "Custom selection (choose specific integrations)" }
        ],
        description: "Choose how the AI agent should access memory and context"
      },
      { 
        name: "memoryIntegration", 
        label: "Memory Integration", 
        type: "select",
        dependsOn: "memory",
        options: [
          { value: "google-drive", label: "Google Drive" },
          { value: "onedrive", label: "OneDrive" },
          { value: "dropbox", label: "Dropbox" },
          { value: "box", label: "Box" },
          { value: "notion", label: "Notion" },
          { value: "airtable", label: "Airtable" },
          { value: "google-sheets", label: "Google Sheets" }
        ],
        placeholder: "Select a storage integration for memory..."
      },
      { 
        name: "customMemoryIntegrations", 
        label: "Custom Memory Integrations", 
        type: "select", 
        multiple: true,
        dependsOn: "memory",
        options: [
          { value: "gmail", label: "Gmail" },
          { value: "slack", label: "Slack" },
          { value: "notion", label: "Notion" },
          { value: "hubspot", label: "HubSpot" },
          { value: "github", label: "GitHub" },
          { value: "google-drive", label: "Google Drive" },
          { value: "google-sheets", label: "Google Sheets" },
          { value: "google-calendar", label: "Google Calendar" },
          { value: "airtable", label: "Airtable" },
          { value: "discord", label: "Discord" },
          { value: "teams", label: "Microsoft Teams" },
          { value: "onedrive", label: "OneDrive" },
          { value: "dropbox", label: "Dropbox" },
          { value: "box", label: "Box" }
        ],
        placeholder: "Select specific integrations for memory access..."
      },
      { 
        name: "systemPrompt", 
        label: "System Prompt (Optional)", 
        type: "textarea",
        placeholder: "Override the default AI system prompt..."
      }
    ],
    outputSchema: [
      {
        name: "input",
        label: "Input Data",
        type: "object",
        description: "The data received from the previous node"
      },
      {
        name: "goal",
        label: "Goal",
        type: "string",
        description: "The goal that was accomplished"
      },
      {
        name: "stepsCompleted",
        label: "Steps Completed",
        type: "number",
        description: "Number of steps taken to accomplish the goal"
      },
      {
        name: "finalResult",
        label: "Final Result",
        type: "object",
        description: "The final result from the last step"
      },
      {
        name: "steps",
        label: "Steps",
        type: "array",
        description: "Detailed breakdown of all steps taken"
      },
      {
        name: "context",
        label: "Context",
        type: "object",
        description: "The final context including all gathered data"
      },
      {
        name: "memory",
        label: "Memory",
        type: "object",
        description: "Memory data accessed during execution"
      }
    ]
  },
  {
    type: "wait_for_time",
    title: "Wait for Time",
    description: "Wait until a specific time or for a duration before continuing",
    icon: Calendar,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      {
        name: "waitType",
        label: "Wait Type",
        type: "select",
        required: true,
        defaultValue: "duration",
        options: [
          { value: "duration", label: "Wait for Duration" },
          { value: "until_time", label: "Wait Until Specific Time" },
          { value: "until_date", label: "Wait Until Specific Date" },
          { value: "business_hours", label: "Wait for Business Hours" }
        ],
        description: "How long to wait"
      },
      {
        name: "duration",
        label: "Duration",
        type: "number",
        placeholder: "e.g., 30",
        description: "How long to wait"
      },
      {
        name: "durationUnit",
        label: "Duration Unit",
        type: "select",
        defaultValue: "minutes",
        options: [
          { value: "seconds", label: "Seconds" },
          { value: "minutes", label: "Minutes" },
          { value: "hours", label: "Hours" },
          { value: "days", label: "Days" },
          { value: "weeks", label: "Weeks" }
        ],
        description: "Unit of time for the duration"
      },
      {
        name: "specificTime",
        label: "Specific Time",
        type: "time",
        placeholder: "14:30",
        description: "Time to wait until (24-hour format)"
      },
      {
        name: "specificDate",
        label: "Specific Date",
        type: "datetime",
        description: "Exact date and time to wait until"
      },
      {
        name: "businessHoursStart",
        label: "Business Hours Start",
        type: "time",
        defaultValue: "09:00",
        description: "When business hours start"
      },
      {
        name: "businessHoursEnd",
        label: "Business Hours End",
        type: "time",
        defaultValue: "17:00",
        description: "When business hours end"
      },
      {
        name: "businessDays",
        label: "Business Days",
        type: "select",
        defaultValue: "weekdays",
        options: [
          { value: "weekdays", label: "Monday - Friday" },
          { value: "custom", label: "Custom Days" }
        ],
        description: "Which days are considered business days"
      },
      {
        name: "customBusinessDays",
        label: "Custom Business Days",
        type: "select",
        options: [
          { value: "monday", label: "Monday" },
          { value: "tuesday", label: "Tuesday" },
          { value: "wednesday", label: "Wednesday" },
          { value: "thursday", label: "Thursday" },
          { value: "friday", label: "Friday" },
          { value: "saturday", label: "Saturday" },
          { value: "sunday", label: "Sunday" }
        ],
        description: "Select which days are business days"
      },
      {
        name: "timezone",
        label: "Timezone",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Auto-detect (Current Timezone)" },
          { value: "America/New_York", label: "Eastern Time" },
          { value: "America/Chicago", label: "Central Time" },
          { value: "America/Denver", label: "Mountain Time" },
          { value: "America/Los_Angeles", label: "Pacific Time" },
          { value: "Europe/London", label: "London" },
          { value: "Europe/Paris", label: "Paris" },
          { value: "Asia/Tokyo", label: "Tokyo" },
          { value: "Asia/Shanghai", label: "Shanghai" },
          { value: "Australia/Sydney", label: "Sydney" },
          { value: "UTC", label: "UTC" }
        ],
        description: "Timezone for time-based waits"
      },
      {
        name: "maxWaitTime",
        label: "Maximum Wait Time",
        type: "number",
        placeholder: "e.g., 24",
        description: "Maximum hours to wait (optional safety limit)"
      }
    ],
  },
  {
    type: "conditional",
    title: "Conditional Logic",
    description: "Branch workflow based on conditions",
    icon: GitBranch,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "condition", label: "Condition", type: "textarea", placeholder: "e.g., {{data.status}} === 'success'" },
    ],
  },
  {
    type: "custom_script",
    title: "Custom Script",
    description: "Run custom Javascript code",
    icon: Code,
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "script", label: "JavaScript Code", type: "textarea", placeholder: "return { value: 1 };" },
    ],
  },
  {
    type: "loop",
    title: "Loop",
    description: "Repeat a set of actions for each item in a list",
    category: "Logic",
    providerId: "logic",
    isTrigger: false,
    configSchema: [
      { name: "items", label: "Items to loop over", type: "text", placeholder: "{{data.array}}" },
    ],
  },

  // Gmail
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
      { name: "from", label: "From", type: "email-autocomplete", dynamic: "gmail-recent-recipients", placeholder: "Optional: filter by sender" },
      { name: "subject", label: "Subject", type: "text", placeholder: "Optional: filter by subject" },
      { name: "hasAttachment", label: "Has Attachment", type: "select", options: ["any", "yes", "no"], defaultValue: "any" },
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
  },
  {
    type: "gmail_trigger_new_attachment",
    title: "New Attachment",
    description: "Triggers when a new email with an attachment is received.",
    isTrigger: true,
    providerId: "gmail",
    category: "Email",
    producesOutput: true,
    configSchema: [
      { name: "from", label: "From", type: "email-autocomplete", dynamic: "gmail-recent-recipients", placeholder: "Optional: filter by sender" },
      { name: "attachmentName", label: "Attachment Name", type: "text", placeholder: "Optional: filter by attachment name" },
    ],
  },
  {
    type: "gmail_trigger_new_label",
    title: "New Label",
    description: "Triggers when a new label is created in Gmail",
    icon: Mail,
    providerId: "gmail",
    category: "Email",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: GMAIL_SEND_EMAIL_METADATA.key,
    title: GMAIL_SEND_EMAIL_METADATA.name,
    description: GMAIL_SEND_EMAIL_METADATA.description,
    icon: Mail,
    isTrigger: false,
    providerId: "gmail",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
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
        required: true,
        dynamic: "gmail-enhanced-recipients",
        placeholder: "Enter recipient email addresses...",
      },
      { name: "cc", label: "CC", type: "email-autocomplete", placeholder: "Enter CC email addresses...", dynamic: "gmail-enhanced-recipients" },
      { name: "bcc", label: "BCC", type: "email-autocomplete", placeholder: "Enter BCC email addresses...", dynamic: "gmail-enhanced-recipients" },
      { name: "subject", label: "Subject", type: "text", placeholder: "Email subject", required: true },
      { name: "body", label: "Body", type: "rich-text", required: true, placeholder: "Compose your email message..." },
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
      attachments: "Files to be included as attachments.",
    },
  },

  // Google Calendar
  {
    type: "google_calendar_trigger_new_event",
    title: "New Event (Google Calendar)",
    description: "Triggers when a new event is created",
    isTrigger: true,
    providerId: "google-calendar",
    category: "Productivity",
    producesOutput: true,
    configSchema: [
      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        required: true,
      },
    ],
  },
  {
    type: "google_calendar_trigger_event_updated",
    title: "Event Updated",
    description: "Triggers when an existing event is updated",
    isTrigger: true,
    providerId: "google-calendar",
    category: "Productivity",
    producesOutput: true,
    configSchema: [
      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        required: true,
      },
    ],
  },
  {
    type: "google_calendar_trigger_event_canceled",
    title: "Event Canceled",
    description: "Triggers when an event is canceled",
    isTrigger: true,
    providerId: "google-calendar",
    category: "Productivity",
    producesOutput: true,
    configSchema: [
      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        required: true,
      },
    ],
  },
  {
    type: "google_calendar_action_create_event",
    title: "Create Event (Google Calendar)",
    description: "Create a new calendar event with comprehensive features",
    isTrigger: false,
    providerId: "google-calendar",
    requiredScopes: ["https://www.googleapis.com/auth/calendar"],
    category: "Productivity",
    configSchema: [
      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        required: true,
      },
      { 
        name: "title", 
        label: "Event Title", 
        type: "text", 
        placeholder: "Add title", 
        required: true 
      },
      { 
        name: "allDay", 
        label: "All Day", 
        type: "boolean",
        defaultValue: false
      },
            {
        name: "startDate",
        label: "Start Date",
        type: "date",
        required: true,
        defaultValue: "today"
      },
      {
        name: "startTime",
        label: "Start Time",
        type: "time",
        required: true,
        defaultValue: "next-hour"
      },
      {
        name: "endDate",
        label: "End Date",
        type: "date",
        required: true,
        defaultValue: "same-as-start"
      },
      {
        name: "endTime",
        label: "End Time",
        type: "time",
        required: true,
        defaultValue: "1-hour-after-start"
      },
      { 
        name: "timeZone", 
        label: "Time Zone", 
        type: "select",
        defaultValue: "user-timezone", // Will be set to user's timezone in ConfigurationModal
        options: [
          { value: "America/New_York", label: "Eastern Time (ET)" },
          { value: "America/Chicago", label: "Central Time (CT)" },
          { value: "America/Denver", label: "Mountain Time (MT)" },
          { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
          { value: "America/Anchorage", label: "Alaska Time (AKT)" },
          { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
          { value: "UTC", label: "UTC (Coordinated Universal Time)" },
          { value: "Europe/London", label: "London (GMT/BST)" },
          { value: "Europe/Paris", label: "Paris (CET/CEST)" },
          { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
          { value: "Europe/Moscow", label: "Moscow (MSK)" },
          { value: "Asia/Tokyo", label: "Tokyo (JST)" },
          { value: "Asia/Shanghai", label: "Shanghai (CST)" },
          { value: "Asia/Dubai", label: "Dubai (GST)" },
          { value: "Asia/Kolkata", label: "Mumbai (IST)" },
          { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
          { value: "Pacific/Auckland", label: "Auckland (NZDT/NZST)" }
        ]
      },
      { 
        name: "attendees", 
        label: "Add guests", 
        type: "email-autocomplete", 
        dynamic: "gmail-enhanced-recipients",
        placeholder: "Select guests from your contacts"
      },
      { 
        name: "location", 
        label: "Add location", 
        type: "location-autocomplete", 
        placeholder: "Enter location or address" 
      },
      { 
        name: "description", 
        label: "Add description", 
        type: "textarea", 
        placeholder: "Add description" 
      },
      { 
        name: "createMeetLink", 
        label: "Add Google Meet video conferencing", 
        type: "boolean", 
        defaultValue: false,
        description: "Automatically add a Google Meet video conference link to this event"
      },
      { 
        name: "sendNotifications", 
        label: "Send invitations", 
        type: "select",
        defaultValue: "all",
        options: [
          { value: "all", label: "Send to all guests" },
          { value: "externalOnly", label: "Send to guests outside your organization" },
          { value: "none", label: "Don't send" }
        ]
      },
      { 
        name: "guestsCanInviteOthers", 
        label: "Guests can invite others", 
        type: "boolean", 
        defaultValue: true
      },
      { 
        name: "guestsCanSeeOtherGuests", 
        label: "Guests can see guest list", 
        type: "boolean", 
        defaultValue: true
      },
      { 
        name: "guestsCanModify", 
        label: "Guests can modify event", 
        type: "boolean", 
        defaultValue: false
      },
      { 
        name: "visibility", 
        label: "Visibility", 
        type: "select",
        defaultValue: "public",
        options: [
          { value: "public", label: "Public" },
          { value: "private", label: "Private" }
        ]
      },
      { 
        name: "transparency", 
        label: "Show as", 
        type: "select",
        defaultValue: "transparent",
        options: [
          { value: "transparent", label: "Free" },
          { value: "opaque", label: "Busy" }
        ]
      },
      { 
        name: "colorId", 
        label: "Color", 
        type: "select",
        defaultValue: "default",
        placeholder: "Calendar color",
        options: [
          { value: "default", label: "Calendar color" },
          { value: "1", label: "Lavender" },
          { value: "2", label: "Sage" },
          { value: "3", label: "Grape" },
          { value: "4", label: "Flamingo" },
          { value: "5", label: "Banana" },
          { value: "6", label: "Tangerine" },
          { value: "7", label: "Peacock" },
          { value: "8", label: "Graphite" },
          { value: "9", label: "Blueberry" },
          { value: "10", label: "Basil" },
          { value: "11", label: "Tomato" }
        ]
      },
      { 
        name: "reminderMinutes", 
        label: "Notification", 
        type: "select",
        defaultValue: "30",
        options: [
          { value: "30", label: "30 minutes before" },
          { value: "0", label: "None" },
          { value: "5", label: "5 minutes before" },
          { value: "10", label: "10 minutes before" },
          { value: "15", label: "15 minutes before" },
          { value: "60", label: "1 hour before" },
          { value: "120", label: "2 hours before" },
          { value: "1440", label: "1 day before" },
          { value: "2880", label: "2 days before" },
          { value: "10080", label: "1 week before" }
        ]
      },
      { 
        name: "reminderMethod", 
        label: "Notification method", 
        type: "select",
        defaultValue: "popup",
        options: [
          { value: "popup", label: "Notification" },
          { value: "email", label: "Email" }
        ]
      },
      { 
        name: "recurrence", 
        label: "Repeat", 
        type: "select",
        placeholder: "Does not repeat",
        options: [
          { value: "none", label: "Does not repeat" },
          { value: "RRULE:FREQ=DAILY", label: "Daily" },
          { value: "RRULE:FREQ=WEEKLY", label: "Weekly" },
          { value: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday (Monday to Friday)" },
          { value: "RRULE:FREQ=MONTHLY", label: "Monthly" },
          { value: "RRULE:FREQ=YEARLY", label: "Annually" }
        ]
      }
    ],
  },

  // Google Drive
  {
    type: "google-drive:new_file_in_folder",
    title: "New File in Folder (Google Drive)",
    description: "Triggers when a new file is added to a folder",
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "folderId",
        label: "Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: true,
      },
    ],
  },
  {
    type: "google-drive:new_folder_in_folder",
    title: "New Folder in Folder",
    description: "Triggers when a new folder is created inside a specific folder in Google Drive.",
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "folderId",
        label: "Parent Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: true,
      },
    ],
  },
  {
    type: "google-drive:file_updated",
    title: "File Updated",
    description: "Triggers when a file in a specific folder is updated",
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "fileId",
        label: "File",
        type: "select",
        dynamic: "google-drive-files",
        required: true,
      },
    ],
  },
  {
    type: "google-drive:create_file",
    title: "Upload File",
    description: "Creates a new file in Google Drive.",
    isTrigger: false,
    providerId: "google-drive",
    category: "Google Drive",
    configSchema: [
      { 
        name: "fileName", 
        label: "File Name", 
        type: "text", 
        required: true,
        placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
        description: "File name for the created file. Will be automatically populated when you upload files."
      },
      { 
        name: "fileContent", 
        label: "File Content", 
        type: "textarea", 
        required: false,
        placeholder: "Enter file content (optional if uploading files)",
        description: "Text content for the file. Leave empty if uploading files."
      },
      { 
        name: "uploadedFiles", 
        label: "Upload Files", 
        type: "file", 
        required: false,
        placeholder: "Choose files to upload...",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
        maxSize: 100 * 1024 * 1024, // 100MB limit for Google Drive
        description: "Upload files to create in Google Drive. Files will be created with their original names and content. The file name field will be auto-populated."
      },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
      },
    ],
  },
  {
    type: "google_drive_action_upload_file",
    title: "Upload File from URL (Google Drive)",
    description: "Upload a file from a URL to Google Drive",
    icon: Upload,
    providerId: "google-drive",
    category: "Google Drive",
    isTrigger: false,
    configSchema: [
      { name: "fileUrl", label: "File URL", type: "text", required: true, placeholder: "Publicly accessible URL of the file" },
      { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "e.g., report.pdf (optional - will use original filename if blank)" },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
      },
    ],
  },

  // Google Sheets
  {
    type: "google_sheets_trigger_new_row",
    title: "New Row (Google Sheets)",
    description: "Triggers when a new row is added to a sheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text" },
      { name: "sheetName", label: "Sheet Name", type: "text" },
    ],
  },
  {
    type: "google_sheets_trigger_new_worksheet",
    title: "New Worksheet",
    description: "Triggers when a new worksheet is created in a spreadsheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text" },
    ],
  },
  {
    type: "google_sheets_trigger_updated_row",
    title: "Updated Row in Sheet",
    description: "Triggers when a row is updated in a Google Sheet.",
    isTrigger: true,
    providerId: "google-sheets",
    category: "Productivity",
    producesOutput: true,
    configSchema: [
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text" },
      { name: "sheetName", label: "Sheet Name", type: "text" },
    ],
  },
  {
    type: "google_sheets_unified_action",
    title: "Manage Sheet Data",
    description: "Add, update, or remove data in Google Sheets with visual column mapping.",
    isTrigger: false,
    providerId: "google-sheets",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    outputSchema: [
      {
        name: "action",
        label: "Action Performed",
        type: "string",
        description: "The action that was performed (add, update, or delete)",
        example: "add"
      },
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the spreadsheet that was modified",
        example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "string",
        description: "The name of the sheet that was modified",
        example: "Sheet1"
      },
      {
        name: "range",
        label: "Updated Range",
        type: "string",
        description: "The range of cells that were affected (for add/update actions)",
        example: "Sheet1!A2:D2"
      },
      {
        name: "updatedRows",
        label: "Updated Rows",
        type: "number",
        description: "Number of rows that were modified",
        example: 1
      },
      {
        name: "success",
        label: "Success Status",
        type: "boolean",
        description: "Whether the operation was completed successfully",
        example: true
      }
    ],
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet from your Google Sheets account",
        description: "Choose from your connected Google Sheets spreadsheets"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        placeholder: "Select a sheet from the spreadsheet",
        description: "Choose from the sheets/tabs in the selected spreadsheet",
        dependsOn: "spreadsheetId"
      },
      {
        name: "action",
        label: "Action",
        type: "select",
        required: true,
        dependsOn: "sheetName",
        options: [
          { value: "add", label: "Add new row" },
          { value: "update", label: "Update existing row" },
          { value: "delete", label: "Delete row" }
        ],
        description: "What operation to perform on the sheet"
      },


    ],
  },
  {
    type: "google-sheets_action_create_row",
    title: "Create Row (Google Sheets)",
    description: "Add a new row to a Google Sheets spreadsheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "spreadsheetId", 
        label: "Spreadsheet", 
        type: "select", 
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet"
      },
      { 
        name: "sheetName", 
        label: "Sheet Name", 
        type: "select", 
        dynamic: "google-sheets_sheets",
        required: true,
        placeholder: "Select a sheet",
        dependsOn: "spreadsheetId"
      },
      {
        name: "insertPosition",
        label: "Insert Position",
        type: "select",
        required: true,
        dependsOn: "sheetName",
        options: [
          { value: "above", label: "Above selected row" },
          { value: "below", label: "Below selected row" },
          { value: "at_end", label: "At the end of sheet" }
        ],
        description: "Where to insert the new row"
      }
    ],
    outputSchema: [
      {
        name: "updatedRange",
        label: "Updated Range",
        type: "string",
        description: "The range of cells that were updated"
      },
      {
        name: "updatedRows",
        label: "Updated Rows",
        type: "number",
        description: "Number of rows that were updated"
      },
      {
        name: "updatedColumns",
        label: "Updated Columns",
        type: "number",
        description: "Number of columns that were updated"
      },
      {
        name: "updatedCells",
        label: "Updated Cells",
        type: "number",
        description: "Number of cells that were updated"
      }
    ]
  },



  // Google Sheets Read Action
  {
    type: "google_sheets_action_read_data",
    title: "Read Data from Sheet",
    description: "Reads data from a Google Sheet with filtering and formatting options.",
    isTrigger: false,
    providerId: "google-sheets",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    producesOutput: true,
    outputSchema: [
      {
        name: "data",
        label: "Sheet Data",
        type: "array",
        description: "The actual data read from the sheet (format depends on Output Format setting)",
        example: [
          { "Name": "John Doe", "Email": "john@example.com", "Status": "Active" },
          { "Name": "Jane Smith", "Email": "jane@example.com", "Status": "Inactive" }
        ]
      },
      {
        name: "headers",
        label: "Column Headers",
        type: "array",
        description: "The column headers from the sheet (when Include Headers is enabled)",
        example: ["Name", "Email", "Status"]
      },
      {
        name: "rowsRead",
        label: "Rows Read",
        type: "number",
        description: "Number of data rows that were read",
        example: 25
      },
      {
        name: "format",
        label: "Data Format",
        type: "string",
        description: "The format of the returned data (objects, array, or csv)",
        example: "objects"
      },
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the spreadsheet that was read",
        example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "string",
        description: "The name of the sheet that was read",
        example: "Sheet1"
      }
    ],
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet from your Google Sheets account",
        description: "Choose from your connected Google Sheets spreadsheets"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        placeholder: "Select a sheet from the spreadsheet",
        description: "Choose from the sheets/tabs in the selected spreadsheet",
        dependsOn: "spreadsheetId"
      },
      {
        name: "readMode",
        label: "Read Mode",
        type: "select",
        required: true,
        dependsOn: "sheetName",
        options: [
          { value: "all", label: "Read all data" },
          { value: "range", label: "Read specific range" },
          { value: "rows", label: "Select specific rows" },
          { value: "cells", label: "Select specific cells" }
        ],
        description: "How do you want to read the data?"
      },
      {
        name: "range",
        label: "Range",
        type: "text",
        required: false,
        placeholder: "e.g., A1:D10, A:A (entire column), 1:1 (entire row)",
        description: "Specific range to read",
        dependsOn: "readMode"
      },
      {
        name: "includeHeaders",
        label: "Include Headers",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Whether to include the first row as headers (recommended for most use cases)"
      },
      {
        name: "maxRows",
        label: "Maximum Rows",
        type: "number",
        required: false,
        placeholder: "100",
        description: "Maximum number of rows to read (0 for all rows)"
      },
      {
        name: "outputFormat",
        label: "Output Format",
        type: "select",
        required: false,
        defaultValue: "objects",
        options: [
          { value: "objects", label: "Array of Objects (Recommended)" },
          { value: "array", label: "Array of Arrays (Spreadsheet-like)" },
          { value: "csv", label: "CSV String (For Import/Export)" }
        ],
        description: "Choose how to format the output data. Objects format is easiest to use in subsequent actions. Use Array of Arrays for spreadsheet-like data or CSV String for importing into other tools."
      },
      {
        name: "filterConditions",
        label: "Filter Conditions",
        type: "textarea",
        required: false,
        placeholder: 'e.g., [{"column": "Status", "operator": "equals", "value": "Active"}]',
        description: "JSON array of filter conditions to apply to the data"
      }
    ],
  },



  // Google Sheets Create Spreadsheet Action
  {
    type: "google_sheets_action_create_spreadsheet",
    title: "Create New Spreadsheet",
    description: "Creates a new Google Sheets spreadsheet with customizable properties.",
    isTrigger: false,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    configSchema: [
      {
        name: "title",
        label: "Spreadsheet Title",
        type: "text",
        required: true,
        placeholder: "e.g., Sales Report 2024, Project Tracker",
        description: "The name of the new spreadsheet"
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Optional description of the spreadsheet",
        description: "A brief description of what this spreadsheet is for"
      },
      {
        name: "sheets",
        label: "Sheets",
        type: "custom",
        required: false,
        description: "Configure multiple sheets for your spreadsheet"
      },

      {
        name: "addHeaders",
        label: "Add Headers",
        type: "boolean",
        defaultValue: true,
        description: "Add column names as the first row of the spreadsheet"
      },

      {
        name: "locale",
        label: "Locale",
        type: "select",
        required: false,
        defaultValue: "en_US",
        options: [
          { value: "en_US", label: "English (US)" },
          { value: "en_GB", label: "English (UK)" },
          { value: "es_ES", label: "Spanish" },
          { value: "fr_FR", label: "French" },
          { value: "de_DE", label: "German" },
          { value: "it_IT", label: "Italian" },
          { value: "pt_BR", label: "Portuguese (Brazil)" },
          { value: "ja_JP", label: "Japanese" },
          { value: "ko_KR", label: "Korean" },
          { value: "zh_CN", label: "Chinese (Simplified)" }
        ],
        description: "The locale of the spreadsheet"
      },
      {
        name: "timeZone",
        label: "Time Zone",
        type: "select",
        required: false,
        options: [
          { value: "America/New_York", label: "Eastern Time" },
          { value: "America/Chicago", label: "Central Time" },
          { value: "America/Denver", label: "Mountain Time" },
          { value: "America/Los_Angeles", label: "Pacific Time" },
          { value: "Europe/London", label: "London" },
          { value: "Europe/Paris", label: "Paris" },
          { value: "Asia/Tokyo", label: "Tokyo" },
          { value: "Asia/Shanghai", label: "Shanghai" },
          { value: "Australia/Sydney", label: "Sydney" },
          { value: "UTC", label: "UTC" }
        ],
        description: "The time zone of the spreadsheet (defaults to your current timezone)"
      }
    ],
  },

  // Slack
  {
    type: "slack_trigger_new_message",
    title: "New Message (Slack)",
    description: "Triggers when a new message is posted in a channel",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        dynamic: "slack-channels",
      },
    ],
  },
  {
    type: "slack_trigger_new_reaction",
    title: "New Reaction",
    description: "Triggers when a reaction is added to a message",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        dynamic: "slack-channels",
      },
      { name: "emoji", label: "Emoji", type: "text", placeholder: "e.g., :thumbsup:" },
    ],
  },
  {
    type: "slack_action_send_message",
    title: "Send Message (Slack)",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "slack",
    requiredScopes: ["chat:write"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: true,
        dynamic: "slack-channels",
        description: "Select the Slack channel where you want to send the message"
      },
      {
        name: "message",
        label: "Message",
        type: "rich-text",
        required: true,
        placeholder: "Type your message...",
        description: "The message content with rich text formatting (bold, italic, links, etc.)"
      },
      { 
        name: "attachments", 
        label: "Attachments", 
        type: "file", 
        required: false,
        placeholder: "Select files to attach", 
        multiple: true,
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
        maxSize: 25 * 1024 * 1024, // 25MB limit
        description: "Attach files from your computer or select files from previous workflow nodes"
      },
      { 
        name: "linkNames", 
        label: "Link Names", 
        type: "boolean", 
        defaultValue: false,
        description: "When enabled, automatically converts @mentions and #channels to clickable links"
      },
      { 
        name: "unfurlLinks", 
        label: "Unfurl Links", 
        type: "boolean", 
        defaultValue: true,
        description: "When enabled, Slack will automatically expand links to show previews"
      },
      { 
        name: "username", 
        label: "Username Override", 
        type: "text", 
        placeholder: "Optional: Override bot username",
        description: "Override the default bot username that appears with the message"
      },
      { 
        name: "iconUrl", 
        label: "Icon", 
        type: "custom", 
        placeholder: "URL to custom icon or upload image file",
        description: "Set a custom icon for the message. You can provide a URL or upload an image file"
      },
      { 
        name: "asUser", 
        label: "As User", 
        type: "boolean", 
        defaultValue: false,
        description: "When enabled, the message will appear to be sent by the authenticated user instead of the bot"
      }
    ],
    outputSchema: [
      {
        name: "ts",
        label: "Message Timestamp",
        type: "string",
        description: "The timestamp of the sent message"
      },
      {
        name: "channel",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the message was sent"
      },
      {
        name: "message",
        label: "Message Object",
        type: "object",
        description: "The complete message object returned by Slack"
      }
    ]
  },
  {
    type: "slack_action_create_channel",
    title: "Create Channel (Slack)",
    description: "Create a new Slack channel with advanced options",
    icon: Hash,
    providerId: "slack",
    requiredScopes: ["groups:write", "users:read"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "workspace",
        label: "Workspace",
        type: "select",
        required: true,
        dynamic: "slack_workspaces",
        description: "Select the Slack workspace."
      },
      {
        name: "template",
        label: "Template",
        type: "combobox",
        required: true,
        defaultValue: "blank",
        options: [
          { value: "blank", label: "Blank Channel" },
          { value: "project-starter-kit", label: "Project Starter Kit" },
          { value: "help-requests-process", label: "Help Requests Process" },
          { value: "time-off-request-process", label: "Time Off Request Process" },
          { value: "employee-benefits-hub", label: "Employee Benefits Hub" },
          { value: "brand-guidelines-hub", label: "Brand Guidelines Hub" },
          { value: "bug-intake-and-triage", label: "Bug Intake And Triage" },
          { value: "sales-enablement-hub", label: "Sales Enablement Hub" },
          { value: "marketing-campaign-starter-kit", label: "Marketing Campaign Starter Kit" },
          { value: "ask-an-expert", label: "Ask An Expert" },
          { value: "event-prep-starter-kit", label: "Event Prep Starter Kit" },
          { value: "external-partner-starter-kit", label: "External Partner Starter Kit" },
          { value: "customer-support", label: "Customer Support" },
          { value: "sales-deal-tracking", label: "Sales Deal Tracking" },
          { value: "one-on-one-coaching", label: "One On One Coaching" },
          { value: "new-hire-onboarding", label: "New Hire Onboarding" },
          { value: "feedback-intake", label: "Feedback Intake" },
          { value: "team-support", label: "Team Support" },
        ] as const,
        description: "Choose a channel template."
      },
      {
        name: "templatePreview",
        label: "Template Preview",
        type: "custom",
        required: false
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "text",
        required: true,
        placeholder: "e.g. plan-budget",
        description: "Enter a channel name (lowercase, no spaces)."
      },
      {
        name: "visibility",
        label: "Visibility",
        type: "select",
        required: true,
        options: [
          { value: "public", label: "Public" },
          { value: "private", label: "Private" }
        ],
        description: "Choose whether the channel is public or private."
      },
      {
        name: "addPeople",
        label: "Add People to Channel",
        type: "combobox",
        multiple: true,
        creatable: true,
        required: false,
        dynamic: "slack_users",
        description: "Add people by name or email."
      },
      {
        name: "autoAddNewMembers",
        label: "Auto-add new workspace members",
        type: "boolean",
        required: false,
        description: "When new people join your workspace, automatically add them to this channel. (Admins only)"
      }
    ]
  },

  // Notion
  {
    type: "notion_trigger_new_page",
    title: "New Page in Database (Notion)",
    description: "Triggers when a page is added to a database",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: "notion_action_create_page",
    title: "Create Page (Notion)",
    description: "Create a new page in Notion",
    icon: Plus,
    providerId: "notion",
    requiredScopes: ["insert"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select", 
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace"
      },
      { 
        name: "title", 
        label: "Page Title", 
        type: "text", 
        required: true,
        placeholder: "Enter page title"
      },
      { 
        name: "icon", 
        label: "Icon (Optional)", 
        type: "file", 
        required: false,
        placeholder: "Select emoji, upload file, or enter URL",
        accept: "image/*,.svg,.png,.jpg,.jpeg,.gif",
        maxSize: 5242880, // 5MB
        description: "Upload an image file, enter an emoji, or provide a URL"
      },
      { 
        name: "cover", 
        label: "Cover Image (Optional)", 
        type: "file", 
        required: false,
        placeholder: "Upload file, enter URL, or select from previous nodes",
        accept: "image/*,.jpg,.jpeg,.png,.gif,.webp",
        maxSize: 10485760, // 10MB
        description: "Upload an image file, enter a URL, or select from previous node outputs"
      },
      { 
        name: "template", 
        label: "Template (Optional)", 
        type: "select", 
        dynamic: "notion_templates",
        required: false,
        placeholder: "Select a template"
      },
      { 
        name: "page_content", 
        label: "Page Content", 
        type: "rich-text", 
        required: false,
        placeholder: "Enter the main content of your page"
      },
      { 
        name: "heading_1", 
        label: "Heading 1 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Main heading for the page"
      },
      { 
        name: "heading_2", 
        label: "Heading 2 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Secondary heading"
      },
      { 
        name: "heading_3", 
        label: "Heading 3 (Optional)", 
        type: "text", 
        required: false,
        placeholder: "Tertiary heading"
      },
      { 
        name: "bullet_list", 
        label: "Bullet List (Optional)", 
        type: "textarea", 
        required: false,
        placeholder: "Enter list items, one per line"
      },
      { 
        name: "numbered_list", 
        label: "Numbered List (Optional)", 
        type: "textarea", 
        required: false,
        placeholder: "Enter list items, one per line"
      },
      { 
        name: "quote", 
        label: "Quote (Optional)", 
        type: "textarea", 
        required: false,
        placeholder: "Enter a quote or callout text"
      },
      { 
        name: "code_block", 
        label: "Code Block (Optional)", 
        type: "textarea", 
        required: false,
        placeholder: "Enter code or technical content"
      },
      { 
        name: "divider", 
        label: "Add Divider", 
        type: "boolean", 
        required: false,
        defaultValue: false
      }
    ],
    outputSchema: [
      {
        name: "pageId",
        label: "Page ID",
        type: "string",
        description: "The unique ID of the created page"
      },
      {
        name: "url",
        label: "Page URL",
        type: "string",
        description: "The web URL of the created page"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the page was created"
      },
      {
        name: "properties",
        label: "Page Properties",
        type: "object",
        description: "The properties of the created page"
      }
    ]
  },
  {
    type: "notion_action_append_to_page",
    title: "Append to Page (Notion)",
    description: "Append content to an existing page",
    icon: Plus,
    providerId: "notion",
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: true, placeholder: "Select a page" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Content to append" }
    ]
  },

  // GitHub
  {
    type: "github_trigger_new_commit",
    title: "New Commit",
    description: "Triggers when a new commit is pushed to a branch.",
    icon: GitBranch,
    providerId: "github",
    category: "Development",
    isTrigger: true,
  },
  {
    type: "github_action_create_issue",
    title: "Create Issue",
    description: "Creates a new issue in a GitHub repository.",
    icon: Plus,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Development",
    isTrigger: false,
    configSchema: [
      { name: "owner", label: "Repository Owner", type: "text", required: true, placeholder: "e.g., octocat" },
      { name: "repo", label: "Repository Name", type: "text", required: true, placeholder: "e.g., my-project" },
      { name: "title", label: "Issue Title", type: "text", required: true },
      { name: "body", label: "Issue Description", type: "textarea" },
      { name: "assignees", label: "Assignees", type: "text", placeholder: "Comma-separated usernames" },
      { name: "labels", label: "Labels", type: "text", placeholder: "Comma-separated labels" },
      { name: "milestone", label: "Milestone ID", type: "number", placeholder: "Optional milestone ID" }
    ],
    outputSchema: [
      {
        name: "issueId",
        label: "Issue ID",
        type: "string",
        description: "The unique ID of the created issue"
      },
      {
        name: "issueNumber",
        label: "Issue Number",
        type: "number",
        description: "The issue number in the repository"
      },
      {
        name: "title",
        label: "Issue Title",
        type: "string",
        description: "The title of the created issue"
      },
      {
        name: "url",
        label: "Issue URL",
        type: "string",
        description: "The web URL of the created issue"
      },
      {
        name: "state",
        label: "Issue State",
        type: "string",
        description: "The current state of the issue (open/closed)"
      },
      {
        name: "createdAt",
        label: "Created At",
        type: "string",
        description: "When the issue was created"
      }
    ]
  },

  // Stripe
  {
    type: "stripe_trigger_new_payment",
    title: "New Payment (Stripe)",
    description: "Triggers on a new successful payment",
    icon: ShoppingCart,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
  },
  {
    type: "stripe_action_create_customer",
    title: "Create Customer (Stripe)",
    description: "Create a new customer",
    icon: Users,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
  },

  // HubSpot
  {
    type: "hubspot_trigger_new_contact",
    title: "New Contact (HubSpot)",
    description: "Triggers when a new contact is created",
    icon: Briefcase,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
  },
  {
    type: "hubspot_action_create_contact",
    title: "Create Contact (HubSpot)",
    description: "Create a new contact",
    icon: Plus,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.contacts.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      { name: "email", label: "Email", type: "email", required: true },
      { name: "firstname", label: "First Name", type: "text" },
      { name: "lastname", label: "Last Name", type: "text" },
      { name: "phone", label: "Phone", type: "text" },
      { 
        name: "company", 
        label: "Company", 
        type: "combobox",
        dynamic: "hubspot_companies",
        required: false,
        placeholder: "Select a company or type to create new",
        creatable: true
      },
      { name: "jobtitle", label: "Job Title", type: "text" },
      { 
        name: "lifecycle_stage", 
        label: "Lifecycle Stage", 
        type: "combobox",
        options: [
          { value: "subscriber", label: "Subscriber" },
          { value: "lead", label: "Lead" },
          { value: "marketingqualifiedlead", label: "Marketing Qualified Lead" },
          { value: "salesqualifiedlead", label: "Sales Qualified Lead" },
          { value: "opportunity", label: "Opportunity" },
          { value: "customer", label: "Customer" },
          { value: "evangelist", label: "Evangelist" },
          { value: "other", label: "Other" }
        ],
        placeholder: "Select a lifecycle stage or type to create new",
        creatable: true
      },
      { 
        name: "lead_status", 
        label: "Lead Status", 
        type: "combobox",
        options: [
          { value: "NEW", label: "New" },
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "PRESENTATION_SCHEDULED", label: "Presentation Scheduled" },
          { value: "CONTRACT_SENT", label: "Contract Sent" },
          { value: "CLOSED_WON", label: "Closed Won" },
          { value: "CLOSED_LOST", label: "Closed Lost" }
        ],
        placeholder: "Select a lead status or type to create new",
        creatable: true
      },
      { name: "custom_properties", label: "Custom Properties (JSON)", type: "textarea", placeholder: '{"custom_field": "value"}' }
    ],
    outputSchema: [
      {
        name: "contactId",
        label: "Contact ID",
        type: "string",
        description: "The unique ID of the created contact"
      },
      {
        name: "email",
        label: "Email",
        type: "string",
        description: "The contact's email address"
      },
      {
        name: "firstname",
        label: "First Name",
        type: "string",
        description: "The contact's first name"
      },
      {
        name: "lastname",
        label: "Last Name",
        type: "string",
        description: "The contact's last name"
      },
      {
        name: "createdAt",
        label: "Created At",
        type: "string",
        description: "When the contact was created"
      }
    ]
  },

  // Airtable
  {
    type: "airtable_trigger_new_record",
    title: "New Record (Airtable)",
    description: "Triggers when a new record is created in a base",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: "airtable_action_create_record",
    title: "Create Record (Airtable)",
    description: "Create a new record in a table",
    icon: Plus,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to create records in",
        dependsOn: "baseId"
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: false,
        placeholder: "Select status",
        description: "Set the status for the new record",
        options: [
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" }
        ]
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "custom",
        required: true,
        description: "Configure the fields and values for the new record",
        dependsOn: "tableName"
      }
    ],
    outputSchema: [
      {
        name: "recordId",
        label: "Record ID",
        type: "string",
        description: "The unique ID of the created record"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the record was created"
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "object",
        description: "The fields and values of the created record"
      }
    ]
  },
  {
    type: "airtable_action_create_record_simple",
    title: "Create Record (Airtable) - Simple",
    description: "Create a new record in an Airtable table with JSON fields",
    icon: Plus,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        dependsOn: "baseId"
      },
      {
        name: "fields",
        label: "Fields (JSON)",
        type: "textarea",
        required: true,
        placeholder: '{"Name": "John Doe", "Email": "john@example.com", "Status": "Active"}'
      },
      {
        name: "typecast",
        label: "Typecast",
        type: "boolean",
        defaultValue: false,
        description: "Automatically convert field values to appropriate types"
      }
    ],
    outputSchema: [
      {
        name: "recordId",
        label: "Record ID",
        type: "string",
        description: "The unique ID of the created record"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the record was created"
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "object",
        description: "The fields and values of the created record"
      },
      {
        name: "commentCount",
        label: "Comment Count",
        type: "number",
        description: "Number of comments on the record"
      }
    ]
  },

  // Discord
  {
    type: "discord_trigger_new_message",
    title: "New Message in Channel",
    description: "Triggers when a new message is posted in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: "discord_action_send_message",
    title: "Send Channel Message",
    description: "Sends a message to a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      {
        name: "guildId",
        label: "Server",
        type: "select",
        dynamic: "discord_guilds",
        required: true,
        placeholder: "Select a Discord server"
      },
      {
        name: "channelId",
        label: "Channel",
        type: "select",
        dynamic: "discord_channels",
        required: true,
        placeholder: "Select a channel",
        dependsOn: "guildId"
      },
      {
        name: "message",
        label: "Message",
        type: "textarea",
        required: true,
        placeholder: "Enter your message"
      }
    ]
  },

  // Microsoft Teams
  {
    type: "teams_trigger_new_message",
    title: "New Message in Channel (Teams)",
    description: "Triggers on a new message in a channel",
    icon: MessageSquare,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel to monitor" }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the new message" },
      { name: "content", label: "Message Content", type: "string", description: "The content of the message" },
      { name: "senderId", label: "Sender ID", type: "string", description: "The ID of the message sender" },
      { name: "senderName", label: "Sender Name", type: "string", description: "The name of the message sender" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was posted" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the channel where the message was posted" },
      { name: "timestamp", label: "Message Time", type: "string", description: "When the message was posted (ISO 8601 format)" },
      { name: "attachments", label: "Attachments", type: "array", description: "Array of file attachments in the message" }
    ]
  },
  {
    type: "teams_action_send_message",
    title: "Send Channel Message (Teams)",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message" },
      { name: "attachments", label: "Attachments", type: "file", required: false, accept: ".pdf,.doc,.docx,.txt,.jpg,.png,.gif", multiple: true, placeholder: "Add file attachments (optional)" }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the sent message" },
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the channel where the message was sent" },
      { name: "timestamp", label: "Sent Time", type: "string", description: "When the message was sent (ISO 8601 format)" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the message was sent successfully" }
    ]
  },
  {
    type: "teams_action_create_meeting",
    title: "Create Meeting (Teams)",
    description: "Create a new online meeting",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["OnlineMeetings.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "subject", label: "Meeting Subject", type: "text", required: true, placeholder: "Enter meeting subject" },
      { name: "startTime", label: "Start Time", type: "datetime", required: true },
      { name: "endTime", label: "End Time", type: "datetime", required: true },
      { name: "attendees", label: "Attendees", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: false, placeholder: "Select or enter attendee email addresses" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Meeting description" },
      { name: "allowMeetingChat", label: "Allow Meeting Chat", type: "boolean", required: false, defaultValue: true },
      { name: "allowCamera", label: "Allow Camera", type: "boolean", required: false, defaultValue: true },
      { name: "allowMic", label: "Allow Microphone", type: "boolean", required: false, defaultValue: true }
    ],
    outputSchema: [
      { name: "meetingId", label: "Meeting ID", type: "string", description: "The ID of the created meeting" },
      { name: "joinUrl", label: "Join URL", type: "string", description: "The URL to join the meeting" },
      { name: "subject", label: "Meeting Subject", type: "string", description: "The subject of the meeting" },
      { name: "startTime", label: "Start Time", type: "string", description: "When the meeting starts (ISO 8601 format)" },
      { name: "endTime", label: "End Time", type: "string", description: "When the meeting ends (ISO 8601 format)" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the meeting was created successfully" }
    ]
  },
  {
    type: "teams_action_send_chat_message",
    title: "Send Chat Message (Teams)",
    description: "Send a message to a specific chat or user",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "chatId", label: "Chat", type: "select", dynamic: "teams_chats", required: true, placeholder: "Select a chat" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message" },
      { name: "attachments", label: "Attachments", type: "file", required: false, accept: ".pdf,.doc,.docx,.txt,.jpg,.png,.gif", multiple: true, placeholder: "Add file attachments (optional)" }
    ]
  },
  {
    type: "teams_action_create_channel",
    title: "Create Channel (Teams)",
    description: "Create a new channel in a team",
    icon: Hash,
    providerId: "teams",
    requiredScopes: ["Channel.Create"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" },
      { name: "channelName", label: "Channel Name", type: "text", required: true, placeholder: "Enter channel name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Channel description (optional)" },
      { name: "isPrivate", label: "Private Channel", type: "boolean", required: false, defaultValue: false }
    ],
    outputSchema: [
      { name: "channelId", label: "Channel ID", type: "string", description: "The ID of the created channel" },
      { name: "channelName", label: "Channel Name", type: "string", description: "The name of the created channel" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team where the channel was created" },
      { name: "isPrivate", label: "Is Private", type: "boolean", description: "Whether the channel is private" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the channel was created successfully" }
    ]
  },
  {
    type: "teams_action_add_member_to_team",
    title: "Add Member to Team (Teams)",
    description: "Add a user to a team",
    icon: UserPlus,
    providerId: "teams",
    requiredScopes: ["TeamMember.ReadWrite.All"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" },
      { name: "userEmail", label: "User Email", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: true, placeholder: "Select or enter user's email address" },
      { name: "role", label: "Role", type: "select", required: true, defaultValue: "member", options: [
        { value: "member", label: "Member" },
        { value: "owner", label: "Owner" }
      ] }
    ]
  },
  {
    type: "teams_action_schedule_meeting",
    title: "Schedule Meeting (Teams)",
    description: "Schedule a meeting with participants",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["Calendars.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "subject", label: "Meeting Subject", type: "text", required: true, placeholder: "Enter meeting subject" },
      { name: "startTime", label: "Start Time", type: "datetime", required: true },
      { name: "endTime", label: "End Time", type: "datetime", required: true },
      { name: "attendees", label: "Attendees", type: "email-autocomplete", dynamic: "outlook-enhanced-recipients", required: false, placeholder: "Select or enter attendee email addresses" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Meeting description" },
      { name: "isOnlineMeeting", label: "Online Meeting", type: "boolean", required: false, defaultValue: true }
    ]
  },
  {
    type: "teams_action_send_adaptive_card",
    title: "Send Adaptive Card (Teams)",
    description: "Send a rich adaptive card message to a channel",
    icon: FileText,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "channelId", label: "Channel", type: "select", dynamic: "teams_channels", required: true, placeholder: "Select a channel" },
      { name: "cardTitle", label: "Card Title", type: "text", required: true, placeholder: "Enter card title" },
      { name: "cardText", label: "Card Text", type: "textarea", required: true, placeholder: "Enter card content" },
      { name: "cardType", label: "Card Type", type: "select", required: true, defaultValue: "hero", options: [
        { value: "hero", label: "Hero Card" },
        { value: "thumbnail", label: "Thumbnail Card" },
        { value: "receipt", label: "Receipt Card" }
      ] }
    ]
  },
  {
    type: "teams_action_get_team_members",
    title: "Get Team Members (Teams)",
    description: "Get all members of a team",
    icon: Users,
    providerId: "teams",
    requiredScopes: ["TeamMember.Read.All"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team" }
    ],
    outputSchema: [
      { name: "members", label: "Team Members", type: "array", description: "Array of team member objects" },
      { name: "memberCount", label: "Member Count", type: "number", description: "Total number of team members" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team" },
      { name: "success", label: "Success Status", type: "boolean", description: "Whether the members were retrieved successfully" }
    ]
  },
  {
    type: "teams_action_create_team",
    title: "Create Team (Teams)",
    description: "Create a new team",
    icon: Plus,
    providerId: "teams",
    requiredScopes: ["Team.Create"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "displayName", label: "Team Name", type: "text", required: true, placeholder: "Enter team name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Team description (optional)" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" }
      ] }
    ]
  },
  {
    type: "onedrive_trigger_file_modified",
    title: "File Modified in Folder",
    description: "Triggers when a file is modified in a specific folder.",
    icon: Upload,
    providerId: "onedrive",
    category: "Storage",
    isTrigger: true,
  },
  {
    type: "onedrive_action_upload_file",
    title: "Upload File (OneDrive)",
    description: "Upload a file to OneDrive",
    icon: Upload,
    providerId: "onedrive",
    requiredScopes: ["Files.ReadWrite"],
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { 
        name: "fileName", 
        label: "File Name", 
        type: "text", 
        required: true,
        placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
        description: "File name for the created file. Will be automatically populated when you upload files."
      },
      { 
        name: "fileContent", 
        label: "File Content", 
        type: "textarea", 
        required: false,
        placeholder: "Enter file content (optional if uploading files)",
        description: "Text content for the file. Leave empty if uploading files."
      },
      { 
        name: "uploadedFiles", 
        label: "Upload Files", 
        type: "file", 
        required: false,
        placeholder: "Choose files to upload...",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
        maxSize: 100 * 1024 * 1024, // 100MB limit for OneDrive
        description: "Upload files to create in OneDrive. Files will be created with their original names and content. The file name field will be auto-populated."
      },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "onedrive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
        description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
      },
    ],
  },
  {
    type: "onedrive_action_upload_file_from_url",
    title: "Upload File from URL (OneDrive)",
    description: "Upload a file from a URL to OneDrive",
    icon: Upload,
    providerId: "onedrive",
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { name: "fileUrl", label: "File URL", type: "text", required: true, placeholder: "Publicly accessible URL of the file" },
      { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "e.g., report.pdf (optional - will use original filename if blank)" },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "onedrive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
      },
    ],
  },
  {
    type: "teams_trigger_new_message_in_chat",
    title: "New Message in Chat",
    description: "Triggers when a new message is posted in a chat",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
    configSchema: [
      { name: "chatId", label: "Chat", type: "select", dynamic: "teams_chats", required: true, placeholder: "Select a chat to monitor" }
    ],
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the new message" },
      { name: "content", label: "Message Content", type: "string", description: "The content of the message" },
      { name: "senderId", label: "Sender ID", type: "string", description: "The ID of the message sender" },
      { name: "senderName", label: "Sender Name", type: "string", description: "The name of the message sender" },
      { name: "chatId", label: "Chat ID", type: "string", description: "The ID of the chat where the message was posted" },
      { name: "chatName", label: "Chat Name", type: "string", description: "The name of the chat where the message was posted" },
      { name: "timestamp", label: "Message Time", type: "string", description: "When the message was posted (ISO 8601 format)" },
      { name: "attachments", label: "Attachments", type: "array", description: "Array of file attachments in the message" }
    ]
  },
  {
    type: "teams_trigger_user_joins_team",
    title: "User Joins Team",
    description: "Triggers when a new user joins a team",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
    configSchema: [
      { name: "teamId", label: "Team", type: "select", dynamic: "teams_teams", required: true, placeholder: "Select a team to monitor" }
    ],
    outputSchema: [
      { name: "userId", label: "User ID", type: "string", description: "The ID of the user who joined" },
      { name: "userName", label: "User Name", type: "string", description: "The name of the user who joined" },
      { name: "userEmail", label: "User Email", type: "string", description: "The email of the user who joined" },
      { name: "teamId", label: "Team ID", type: "string", description: "The ID of the team the user joined" },
      { name: "teamName", label: "Team Name", type: "string", description: "The name of the team the user joined" },
      { name: "joinTime", label: "Join Time", type: "string", description: "When the user joined the team (ISO 8601 format)" },
      { name: "role", label: "User Role", type: "string", description: "The role assigned to the user in the team" }
    ]
  },

  // Twitter (X) Triggers
  {
    type: "twitter_trigger_new_mention",
    title: "New Mention",
    description: "Triggers when someone mentions your account in a tweet",
    icon: AtSign,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the tweet that mentioned you" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the user who mentioned you" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the user who mentioned you" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the user who mentioned you" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" }
    ]
  },
  {
    type: "twitter_trigger_new_follower",
    title: "New Follower",
    description: "Triggers when someone follows your account",
    icon: UserPlus,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "followerId", label: "Follower ID", type: "string", description: "The ID of the new follower" },
      { name: "followerUsername", label: "Follower Username", type: "string", description: "The username of the new follower" },
      { name: "followerName", label: "Follower Name", type: "string", description: "The display name of the new follower" },
      { name: "followerBio", label: "Follower Bio", type: "string", description: "The bio of the new follower" },
      { name: "followerProfileImage", label: "Follower Profile Image", type: "string", description: "URL of the follower's profile image" },
      { name: "followedAt", label: "Followed At", type: "string", description: "When they followed you (ISO 8601 format)" }
    ]
  },
  {
    type: "twitter_trigger_new_direct_message",
    title: "New Direct Message",
    description: "Triggers when you receive a new direct message",
    icon: MessageCircle,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    outputSchema: [
      { name: "messageId", label: "Message ID", type: "string", description: "The ID of the direct message" },
      { name: "messageText", label: "Message Text", type: "string", description: "The text content of the message" },
      { name: "senderId", label: "Sender ID", type: "string", description: "The ID of the message sender" },
      { name: "senderUsername", label: "Sender Username", type: "string", description: "The username of the message sender" },
      { name: "senderName", label: "Sender Name", type: "string", description: "The display name of the message sender" },
      { name: "sentAt", label: "Sent At", type: "string", description: "When the message was sent (ISO 8601 format)" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the message contains media" }
    ]
  },
  {
    type: "twitter_trigger_search_match",
    title: "Tweet Matching Search",
    description: "Triggers when a tweet matches your search query",
    icon: Search,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { 
        name: "searchQuery", 
        label: "Search Query", 
        type: "text", 
        required: true, 
        placeholder: "Enter keywords, hashtags, or phrases to search for",
        description: "Search for tweets containing specific keywords, hashtags, or phrases"
      },
      { 
        name: "filters", 
        label: "Search Filters", 
        type: "multi-select", 
        required: false, 
        options: [
          { value: "verified", label: "Verified accounts only" },
          { value: "has:links", label: "Tweets with links" },
          { value: "has:media", label: "Tweets with media" },
          { value: "has:images", label: "Tweets with images" },
          { value: "has:videos", label: "Tweets with videos" },
          { value: "lang:en", label: "English tweets only" },
          { value: "is:retweet", label: "Retweets only" },
          { value: "is:reply", label: "Replies only" },
          { value: "is:quote", label: "Quote tweets only" }
        ],
        description: "Apply filters to narrow down search results"
      }
    ],
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the matching tweet" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the tweet author" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the tweet author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the tweet author" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the tweet contains media" }
    ]
  },
  {
    type: "twitter_trigger_user_tweet",
    title: "User Tweet Posted",
    description: "Triggers when a specific user posts a tweet",
    icon: MessageSquare,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { 
        name: "username", 
        label: "Username", 
        type: "text", 
        required: true, 
        placeholder: "Enter the username to monitor (without @)",
        description: "The username of the account to monitor for new tweets"
      }
    ],
    outputSchema: [
      { name: "tweetId", label: "Tweet ID", type: "string", description: "The ID of the new tweet" },
      { name: "tweetText", label: "Tweet Text", type: "string", description: "The text content of the tweet" },
      { name: "authorId", label: "Author ID", type: "string", description: "The ID of the tweet author" },
      { name: "authorUsername", label: "Author Username", type: "string", description: "The username of the tweet author" },
      { name: "authorName", label: "Author Name", type: "string", description: "The display name of the tweet author" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the tweet was created (ISO 8601 format)" },
      { name: "retweetCount", label: "Retweet Count", type: "number", description: "Number of retweets" },
      { name: "likeCount", label: "Like Count", type: "number", description: "Number of likes" },
      { name: "replyCount", label: "Reply Count", type: "number", description: "Number of replies" },
      { name: "hasMedia", label: "Has Media", type: "boolean", description: "Whether the tweet contains media" }
    ]
  },

  // Twitter (X) Actions
  {
    type: "twitter_action_post_tweet",
    title: "Post Tweet",
    description: "Post a new tweet to your account",
    icon: PenSquare,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "text", 
        label: "Tweet Text", 
        type: "textarea", 
        required: true, 
        placeholder: "What's happening?",
        description: "The text content of your tweet (max 280 characters)"
      },
      { 
        name: "mediaFiles", 
        label: "Media Attachments", 
        type: "file", 
        required: false, 
        accept: "image/*,video/*,.gif",
        maxSize: 5 * 1024 * 1024, // 5MB limit
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload up to 4 media files (images, videos, or GIFs)"
      },
      { 
        name: "altTexts", 
        label: "Alt Text for Media", 
        type: "textarea", 
        required: false, 
        placeholder: "Describe your media for accessibility (one description per line)",
        description: "Provide alt text descriptions for each media file, one per line"
      },
      { 
        name: "pollQuestion", 
        label: "Poll Question", 
        type: "text", 
        required: false, 
        placeholder: "Ask a question for your poll",
        description: "Create a poll with your tweet"
      },
      { 
        name: "pollOptions", 
        label: "Poll Options", 
        type: "textarea", 
        required: false, 
        placeholder: "Option 1\nOption 2\nOption 3\nOption 4",
        description: "Enter 2-4 poll options, one per line"
      },
      { 
        name: "pollDuration", 
        label: "Poll Duration", 
        type: "select", 
        required: false, 
        options: [
          { value: "5", label: "5 minutes" },
          { value: "15", label: "15 minutes" },
          { value: "30", label: "30 minutes" },
          { value: "60", label: "60 minutes" }
        ],
        defaultValue: "15",
        description: "How long should the poll run?"
      },
      { 
        name: "location", 
        label: "Location", 
        type: "location-autocomplete", 
        required: false, 
        placeholder: "Search for a location",
        description: "Add a location to your tweet"
      },
      { 
        name: "sensitiveMedia", 
        label: "Mark Media as Sensitive", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Check if your media contains sensitive content"
      },
      { 
        name: "scheduledTime", 
        label: "Schedule Tweet", 
        type: "datetime", 
        required: false, 
        placeholder: "Select date and time",
        description: "Schedule your tweet for a future time"
      }
    ]
  },
  {
    type: "twitter_action_reply_tweet",
    title: "Reply to Tweet",
    description: "Reply to an existing tweet",
    icon: Reply,
    providerId: "twitter",
    requiredScopes: ["tweet.write", "tweet.read", "users.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      {
        name: "tweetId",
        label: "Tweet to Reply To",
        type: "select",
        required: true,
        dynamic: "twitter_mentions",
        placeholder: "Select a tweet you were mentioned in",
        description: "Choose a recent tweet mentioning you to reply to"
      },
      {
        name: "text",
        label: "Reply Text",
        type: "textarea",
        required: true,
        placeholder: "Write your reply...",
        description: "The text content of your reply (max 280 characters)"
      },
      {
        name: "mediaFiles",
        label: "Media Attachments",
        type: "file",
        required: false,
        accept: "image/*,video/*,.gif",
        maxSize: 5 * 1024 * 1024,
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload up to 4 media files (images, videos, or GIFs)"
      },
      {
        name: "altTexts",
        label: "Alt Text for Media",
        type: "textarea",
        required: false,
        placeholder: "Describe your media for accessibility (one description per line)",
        description: "Provide alt text descriptions for each media file, one per line"
      }
    ]
  },
  {
    type: "twitter_action_retweet",
    title: "Retweet",
    description: "Retweet an existing tweet",
    icon: Repeat,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Retweet", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to retweet",
        description: "The ID of the tweet you want to retweet"
      }
    ]
  },
  {
    type: "twitter_action_unretweet",
    title: "Undo Retweet",
    description: "Remove a retweet from your timeline",
    icon: RotateCcw,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Unretweet", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to unretweet",
        description: "The ID of the tweet you want to remove from your retweets"
      }
    ]
  },
  {
    type: "twitter_action_like_tweet",
    title: "Like Tweet",
    description: "Like an existing tweet",
    icon: Heart,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Like", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to like",
        description: "The ID of the tweet you want to like"
      }
    ]
  },
  {
    type: "twitter_action_unlike_tweet",
    title: "Unlike Tweet",
    description: "Remove a like from a tweet",
    icon: HeartOff,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Unlike", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to unlike",
        description: "The ID of the tweet you want to remove your like from"
      }
    ]
  },
  {
    type: "twitter_action_send_dm",
    title: "Send Direct Message",
    description: "Send a direct message to a user",
    icon: MessageCircle,
    providerId: "twitter",
    requiredScopes: ["dm.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "recipientId", 
        label: "Recipient User ID", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the recipient",
        description: "The user ID of the person you want to send a DM to"
      },
      { 
        name: "message", 
        label: "Message", 
        type: "textarea", 
        required: true, 
        placeholder: "Write your message...",
        description: "The text content of your direct message"
      },
      { 
        name: "mediaFiles", 
        label: "Media Attachments", 
        type: "file", 
        required: false, 
        accept: "image/*,video/*,.gif",
        maxSize: 5 * 1024 * 1024,
        placeholder: "Upload images, videos, or GIFs",
        description: "Upload media files to include in your DM"
      }
    ]
  },
  {
    type: "twitter_action_follow_user",
    title: "Follow User",
    description: "Follow a user on Twitter",
    icon: UserPlus,
    providerId: "twitter",
    requiredScopes: ["users.read", "follows.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID to Follow", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the person you want to follow",
        description: "The user ID of the person you want to follow"
      }
    ]
  },
  {
    type: "twitter_action_unfollow_user",
    title: "Unfollow User",
    description: "Unfollow a user on Twitter",
    icon: UserMinus,
    providerId: "twitter",
    requiredScopes: ["users.read", "follows.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID to Unfollow", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID of the person you want to unfollow",
        description: "The user ID of the person you want to unfollow"
      }
    ]
  },
  {
    type: "twitter_action_delete_tweet",
    title: "Delete Tweet",
    description: "Delete one of your tweets",
    icon: Trash2,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "tweetId", 
        label: "Tweet ID to Delete", 
        type: "text", 
        required: true, 
        placeholder: "Enter the ID of the tweet you want to delete",
        description: "The ID of the tweet you want to delete (must be your own tweet)"
      }
    ]
  },
  {
    type: "twitter_action_search_tweets",
    title: "Search Tweets",
    description: "Search for tweets based on keywords, hashtags, and filters",
    icon: Search,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "query", 
        label: "Search Query", 
        type: "text", 
        required: true, 
        placeholder: "Enter keywords, hashtags, or phrases to search for",
        description: "Search for tweets containing specific keywords, hashtags, or phrases"
      },
      { 
        name: "filters", 
        label: "Search Filters", 
        type: "multi-select", 
        required: false, 
        options: [
          { value: "verified", label: "Verified accounts only" },
          { value: "has:links", label: "Tweets with links" },
          { value: "has:media", label: "Tweets with media" },
          { value: "has:images", label: "Tweets with images" },
          { value: "has:videos", label: "Tweets with videos" },
          { value: "lang:en", label: "English tweets only" },
          { value: "is:retweet", label: "Retweets only" },
          { value: "is:reply", label: "Replies only" },
          { value: "is:quote", label: "Quote tweets only" }
        ],
        description: "Apply filters to narrow down search results"
      },
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of tweets to return (1-100)"
      },
      { 
        name: "startTime", 
        label: "Start Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Search tweets from this time onwards",
        description: "Only return tweets created after this time"
      },
      { 
        name: "endTime", 
        label: "End Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Search tweets up to this time",
        description: "Only return tweets created before this time"
      }
    ]
  },
  {
    type: "twitter_action_get_user_timeline",
    title: "Get User Timeline",
    description: "Get tweets from a user's timeline",
    icon: Clock,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "userId", 
        label: "User ID", 
        type: "text", 
        required: true, 
        placeholder: "Enter the user ID to get timeline for",
        description: "The user ID to get the timeline for"
      },
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of tweets to return (1-100)"
      },
      { 
        name: "excludeRetweets", 
        label: "Exclude Retweets", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Exclude retweets from the results"
      },
      { 
        name: "excludeReplies", 
        label: "Exclude Replies", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Exclude replies from the results"
      }
    ]
  },
  {
    type: "twitter_action_get_mentions",
    title: "Get Mentions Timeline",
    description: "Get tweets that mention your account",
    icon: AtSign,
    providerId: "twitter",
    requiredScopes: ["tweet.read"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { 
        name: "maxResults", 
        label: "Maximum Results", 
        type: "number", 
        required: false, 
        defaultValue: 10,
        placeholder: "10",
        description: "Maximum number of mentions to return (1-100)"
      },
      { 
        name: "startTime", 
        label: "Start Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Get mentions from this time onwards",
        description: "Only return mentions created after this time"
      },
      { 
        name: "endTime", 
        label: "End Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Get mentions up to this time",
        description: "Only return mentions created before this time"
      }
    ]
  },

  // Trello
  {
    type: "trello_trigger_new_card",
    title: "New Card",
    description: "Triggers when a new card is created on a board.",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "trello_action_create_card",
    title: "Create Card",
    description: "Creates a new card on a Trello board.",
    icon: Plus,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello-boards", placeholder: "Select a board" },
      { name: "template", label: "Card Template", type: "select", required: false, dynamic: "trello-card-templates", dependsOn: "boardId", placeholder: "Select a card template (optional)" },
      { name: "listId", label: "List", type: "select", required: true, dynamic: "trello_lists", dependsOn: "boardId", placeholder: "Select a list" },
      { name: "name", label: "Card Name", type: "text", required: true, dependsOn: "boardId", placeholder: "Enter card name" },
      { name: "desc", label: "Description", type: "textarea", required: false, dependsOn: "boardId", placeholder: "Enter card description (optional)" }
    ]
  },

  // Dropbox
  {
    type: "dropbox_trigger_new_file",
    title: "New File (Dropbox)",
    description: "Triggers when a new file is added to a folder",
    icon: Upload,
    providerId: "dropbox",
    category: "Storage",
    isTrigger: true,
  },
  {
    type: "dropbox_action_upload_file",
    title: "Upload File (Dropbox)",
    description: "Upload a file to Dropbox",
    icon: Upload,
    providerId: "dropbox",
    requiredScopes: ["files.content.write"],
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { 
        name: "fileName", 
        label: "File Name", 
        type: "text", 
        required: true,
        placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
        description: "File name for the created file. Will be automatically populated when you upload files."
      },
      { 
        name: "fileContent", 
        label: "File Content", 
        type: "textarea", 
        required: false,
        placeholder: "Enter file content (optional if uploading files)",
        description: "Text content for the file. Leave empty if uploading files."
      },
      { 
        name: "uploadedFiles", 
        label: "Upload Files", 
        type: "file", 
        required: false,
        placeholder: "Choose files to upload...",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
        maxSize: 150 * 1024 * 1024, // 150MB limit for Dropbox
        description: "Upload files to create in Dropbox. Files will be created with their original names and content. The file name field will be auto-populated."
      },
      {
        name: "path",
        label: "Destination Folder",
        type: "select",
        dynamic: "dropbox-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
        description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
      },
    ],
  },
  {
    type: "dropbox_action_upload_file_from_url",
    title: "Upload File from URL (Dropbox)",
    description: "Upload a file from a URL to Dropbox",
    icon: Upload,
    providerId: "dropbox",
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { name: "fileUrl", label: "File URL", type: "text", required: true, placeholder: "Publicly accessible URL of the file" },
      { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "e.g., report.pdf (optional - will use original filename if blank)" },
      {
        name: "path",
        label: "Destination Folder",
        type: "select",
        dynamic: "dropbox-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
      },
    ],
  },

  // YouTube
  {
    type: "youtube_trigger_new_video",
    title: "New Video by Channel",
    description: "Triggers when a new video is uploaded to a channel",
    icon: Video,
    providerId: "youtube",
    category: "Social",
    isTrigger: true,
    configSchema: [
      {
        name: "channelId",
        label: "Channel",
        type: "select",
        dynamic: "youtube_channels",
        required: true,
        placeholder: "Select a channel from your YouTube account",
        description: "Choose from your connected YouTube channels"
      }
    ]
  },
  {
    type: "youtube_trigger_new_comment",
    title: "New Comment on Video",
    description: "Triggers when a new comment is posted on a video",
    icon: Video,
    providerId: "youtube",
    category: "Social",
    isTrigger: true,
    configSchema: [
      {
        name: "videoId",
        label: "Video",
        type: "select",
        dynamic: "youtube_videos",
        required: true,
        placeholder: "Select a video from your YouTube account",
        description: "Choose from your uploaded YouTube videos"
      }
    ]
  },
  {
    type: "youtube_action_upload_video",
    title: "Upload Video (YouTube)",
    description: "Upload a new video to your channel",
    icon: Upload,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { 
        name: "videoFile", 
        label: "Video File", 
        type: "file", 
        required: true, 
        accept: ".mp4,.mov,.avi,.wmv,.flv,.mkv,.webm", 
        maxSize: 256 * 1024 * 1024 * 1024, 
        placeholder: "Select a video file to upload",
        description: "Upload your video file (max 256 GB or 12 hours, whichever comes first)"
      },
      { 
        name: "title", 
        label: "Title", 
        type: "text", 
        required: true, 
        placeholder: "Enter video title",
        description: "The title of your video"
      },
      { 
        name: "description", 
        label: "Description", 
        type: "textarea", 
        required: false, 
        placeholder: "Enter video description",
        description: "Optional description for your video"
      },
      { 
        name: "tags", 
        label: "Tags", 
        type: "multi-select", 
        required: false, 
        placeholder: "Add tags to help people find your video",
        description: "Tags to help with video discovery (optional)"
      },
      { 
        name: "category", 
        label: "Category", 
        type: "select", 
        required: false, 
        placeholder: "Select a category",
        description: "YouTube video category",
        options: [
          { value: "1", label: "Film & Animation" },
          { value: "2", label: "Autos & Vehicles" },
          { value: "10", label: "Music" },
          { value: "15", label: "Pets & Animals" },
          { value: "17", label: "Sports" },
          { value: "19", label: "Travel & Events" },
          { value: "20", label: "Gaming" },
          { value: "22", label: "People & Blogs" },
          { value: "23", label: "Comedy" },
          { value: "24", label: "Entertainment" },
          { value: "25", label: "News & Politics" },
          { value: "26", label: "Howto & Style" },
          { value: "27", label: "Education" },
          { value: "28", label: "Science & Technology" },
          { value: "29", label: "Nonprofits & Activism" }
        ]
      },
      { 
        name: "privacyStatus", 
        label: "Privacy Status", 
        type: "select", 
        required: true, 
        defaultValue: "private", 
        description: "Who can see your video",
        options: [ 
          { value: "public", label: "Public" }, 
          { value: "unlisted", label: "Unlisted" }, 
          { value: "private", label: "Private" } 
        ] 
      },
      { 
        name: "publishAt", 
        label: "Publish Date & Time", 
        type: "datetime", 
        required: false, 
        placeholder: "Schedule video for later publication",
        description: "Schedule your video to be published at a specific time (optional)"
      },
      { 
        name: "thumbnailMode", 
        label: "Thumbnail", 
        type: "select", 
        required: false, 
        defaultValue: "upload",
        description: "Choose how to add a thumbnail",
        options: [
          { value: "upload", label: "Upload Image" },
          { value: "url", label: "Image URL" }
        ]
      },
      { 
        name: "thumbnailFile", 
        label: "Upload Thumbnail", 
        type: "file", 
        required: false, 
        accept: "image/jpeg,image/png",
        maxSize: 2 * 1024 * 1024,
        placeholder: "Upload thumbnail image",
        description: "Upload a custom thumbnail image (optional) - max 2 MB; JPEG/PNG only"
      },
      { 
        name: "thumbnailUrl", 
        label: "Thumbnail URL", 
        type: "text", 
        required: false, 
        placeholder: "https://example.com/thumbnail.jpg",
        description: "URL to a thumbnail image (optional)"
      },
      { 
        name: "playlists", 
        label: "Add to Playlists", 
        type: "multi-select", 
        dynamic: "youtube_playlists",
        required: false, 
        placeholder: "Select playlists to add video to",
        description: "Add this video to one or more playlists (optional)"
      },
      { 
        name: "license", 
        label: "License", 
        type: "select", 
        required: false, 
        defaultValue: "youtube",
        description: "License for your video",
        options: [
          { value: "youtube", label: "Standard YouTube License" },
          { value: "creativeCommon", label: "Creative Commons" }
        ]
      },
      { 
        name: "madeForKids", 
        label: "Made for Kids", 
        type: "boolean", 
        required: false, 
        defaultValue: false,
        description: "Indicate if this video is made for kids"
      },
      { 
        name: "ageRestriction", 
        label: "Age Restriction", 
        type: "select", 
        required: false, 
        defaultValue: "none",
        description: "Age restriction for your video",
        options: [
          { value: "none", label: "None" },
          { value: "18+", label: "18+" }
        ]
      },
      { 
        name: "locationLatitude", 
        label: "Location Latitude", 
        type: "number", 
        required: false, 
        placeholder: "40.7128",
        description: "Latitude coordinate for video location (optional)"
      },
      { 
        name: "locationLongitude", 
        label: "Location Longitude", 
        type: "number", 
        required: false, 
        placeholder: "-74.0060",
        description: "Longitude coordinate for video location (optional)"
      },
      { 
        name: "locationName", 
        label: "Location Name", 
        type: "text", 
        required: false, 
        placeholder: "New York, NY",
        description: "Name of the location where video was recorded (optional)"
      },
      { 
        name: "recordingDate", 
        label: "Recording Date & Time", 
        type: "datetime", 
        required: false, 
        placeholder: "When was this video recorded?",
        description: "Date and time when the video was recorded (optional)"
      },
      { 
        name: "notifySubscribers", 
        label: "Notify Subscribers", 
        type: "boolean", 
        required: false, 
        defaultValue: true,
        description: "Send notification to subscribers when video is published"
      },
      { 
        name: "allowComments", 
        label: "Allow Comments", 
        type: "boolean", 
        required: false, 
        defaultValue: true,
        description: "Allow viewers to comment on this video"
      },
      { 
        name: "allowRatings", 
        label: "Allow Ratings", 
        type: "boolean", 
        required: false, 
        defaultValue: true,
        description: "Allow viewers to rate this video"
      },
      { 
        name: "allowEmbedding", 
        label: "Allow Embedding", 
        type: "boolean", 
        required: false, 
        defaultValue: true,
        description: "Allow this video to be embedded on other websites"
      }
    ]
  },
  {
    type: "youtube_action_update_video",
    title: "Update Video Details (YouTube)",
    description: "Update the title, description, privacy, or tags of a video",
    icon: Edit,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to update" },
      { name: "title", label: "Title", type: "text", required: false, placeholder: "New title (optional)" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "New description (optional)" },
      { name: "privacyStatus", label: "Privacy Status", type: "select", required: false, options: [ { value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Private" } ] },
      { name: "tags", label: "Tags", type: "text", required: false, placeholder: "Comma-separated tags (optional)" }
    ]
  },
  {
    type: "youtube_action_delete_video",
    title: "Delete Video (YouTube)",
    description: "Delete a video from your YouTube channel",
    icon: Edit,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to delete" }
    ]
  },
  {
    type: "youtube_action_get_video_analytics",
    title: "Get Video Analytics (YouTube)",
    description: "Fetch analytics for a selected video",
    icon: BarChart,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to get analytics for" }
    ]
  },
  {
    type: "youtube_action_add_to_playlist",
    title: "Add Video to Playlist (YouTube)",
    description: "Add a video to a playlist",
    icon: Plus,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to add" },
      { name: "playlistId", label: "Playlist", type: "select", dynamic: "youtube_playlists", required: true, placeholder: "Select a playlist" }
    ]
  },
  {
    type: "youtube_action_list_playlists",
    title: "List My Playlists (YouTube)",
    description: "List all playlists from your YouTube account",
    icon: Video,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    category: "Social",
    isTrigger: false,
    configSchema: []
  },

  // Shopify
  {
    type: "shopify_trigger_new_order",
    title: "New Order (Shopify)",
    description: "Triggers when a new order is placed",
    icon: ShoppingCart,
    providerId: "shopify",
    category: "eCommerce",
    isTrigger: true,
  },
  {
    type: "shopify_action_create_product",
    title: "Create Product (Shopify)",
    description: "Create a new product",
    icon: Plus,
    providerId: "shopify",
    requiredScopes: ["write_products"],
    category: "eCommerce",
    isTrigger: false,
  },

  // --- New Triggers from User ---

  // Facebook
  {
    type: "facebook_trigger_new_post",
    title: "New post published",
    description: "Triggers when a new post is published to a Page",
    icon: PenSquare,
    providerId: "facebook",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["pages_read_engagement"],
  },
  {
    type: "facebook_trigger_new_comment",
    title: "New comment on post",
    description: "Triggers when a new comment is made on a Page post",
    icon: MessageSquare,
    providerId: "facebook",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["pages_read_engagement"],
  },

  // Instagram
  {
    type: "instagram_trigger_new_media",
    title: "New photo or video posted",
    description: "Triggers when a new photo or video is posted",
    icon: Video,
    providerId: "instagram",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["user_media"],
  },
  {
    type: "instagram_trigger_new_comment",
    title: "New comment on a post",
    description: "Triggers when a new comment is made on your media",
    icon: MessageSquare,
    providerId: "instagram",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["user_media"],
  },

  // LinkedIn
  {
    type: "linkedin_trigger_new_post",
    title: "New post published",
    description: "Triggers when a new post is published to a company page",
    icon: PenSquare,
    providerId: "linkedin",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["w_member_social"],
  },
  {
    type: "linkedin_trigger_new_comment",
    title: "New comment or reaction",
    description: "Triggers on a new comment or reaction on a company page post",
    icon: MessageSquare,
    providerId: "linkedin",
    category: "Social",
    isTrigger: true,
    requiredScopes: ["w_member_social"],
  },

  // Mailchimp
  {
    type: "mailchimp_trigger_new_subscriber",
    title: "New subscriber added",
    description: "Triggers when a new subscriber is added to an audience",
    icon: Users,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  },
  {
    type: "mailchimp_trigger_email_opened",
    title: "Email campaign opened",
    description: "Triggers when a subscriber opens an email campaign",
    icon: MailOpen,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  },

  // Kit
  {
    type: "kit_trigger_new_subscriber",
    title: "New subscriber added",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "kit",
    category: "Email",
    isTrigger: true,
  },
  {
    type: "kit_trigger_tag_added",
    title: "Tag added to a subscriber",
    description: "Triggers when a tag is added to a subscriber",
    icon: BarChart,
    providerId: "kit",
    category: "Email",
    isTrigger: true,
  },

  // OneDrive
  {
    type: "onedrive_trigger_new_file",
    title: "New file or folder",
    description: "Triggers when a new file or folder is created",
    icon: Upload,
    providerId: "onedrive",
    category: "Storage",
    isTrigger: true,
    requiredScopes: ["Files.ReadWrite"],
  },
  {
    type: "onedrive_trigger_file_modified",
    title: "File modified",
    description: "Triggers when a file is modified",
    icon: FileText,
    providerId: "onedrive",
    category: "Storage",
    isTrigger: true,
    requiredScopes: ["Files.ReadWrite"],
  },

  // Box
  {
    type: "box_trigger_new_file",
    title: "New file uploaded",
    description: "Triggers when a new file is uploaded to a folder",
    icon: Upload,
    providerId: "box",
    category: "Storage",
    isTrigger: true,
    requiredScopes: ["root_readwrite"],
  },
  {
    type: "box_trigger_new_comment",
    title: "New comment on file",
    description: "Triggers when a new comment is added to a file",
    icon: MessageSquare,
    providerId: "box",
    category: "Storage",
    isTrigger: true,
    requiredScopes: ["root_readwrite"],
  },

  // PayPal
  {
    type: "paypal_trigger_new_payment",
    title: "New successful payment",
    description: "Triggers when a new successful payment is received",
    icon: ShoppingCart,
    providerId: "paypal",
    category: "Finance",
    isTrigger: true,
  },
  {
    type: "paypal_trigger_new_subscription",
    title: "New subscription created",
    description: "Triggers when a new subscription is created",
    icon: Repeat,
    providerId: "paypal",
    category: "Finance",
    isTrigger: true,
  },

  // GitLab
  {
    type: "gitlab_trigger_new_push",
    title: "New push to repository",
    description: "Triggers on a new push to a repository branch",
    icon: GitBranch,
    providerId: "gitlab",
    category: "Development",
    isTrigger: true,
    requiredScopes: ["read_repository"],
  },
  {
    type: "gitlab_trigger_new_issue",
    title: "Issue opened or closed",
    description: "Triggers when an issue is opened or closed",
    icon: AlertTriangle,
    providerId: "gitlab",
    category: "Development",
    isTrigger: true,
    requiredScopes: ["read_repository"],
  },

  // Microsoft Outlook
  {
    type: "microsoft-outlook_trigger_new_email",
    title: "New email received",
    description: "Triggers when a new email is received",
    icon: Mail,
    providerId: "microsoft-outlook",
    category: "Communication",
    isTrigger: true,
    requiredScopes: ["Mail.Read"],
  },
  {
    type: "microsoft-outlook_trigger_email_sent",
    title: "Email sent",
    description: "Triggers when an email is sent",
    icon: Send,
    providerId: "microsoft-outlook",
    category: "Communication",
    isTrigger: true,
    requiredScopes: ["Mail.Send"],
  },

  // Microsoft OneNote
  {
    type: "microsoft-onenote_trigger_new_note",
    title: "New note created",
    description: "Triggers when a new note is created",
    icon: FileText,
    providerId: "microsoft-onenote",
    category: "Productivity",
    isTrigger: true,
    requiredScopes: ["Notes.ReadWrite.All"],
  },
  {
    type: "microsoft-onenote_trigger_note_modified",
    title: "Note modified",
    description: "Triggers when a note is modified",
    icon: Edit,
    providerId: "microsoft-onenote",
    category: "Productivity",
    isTrigger: true,
    requiredScopes: ["Notes.ReadWrite.All"],
  },

  // --- Start of newly added nodes ---

  // Gmail / Outlook Actions
  {
    type: GMAIL_ADD_LABEL_METADATA.key,
    title: GMAIL_ADD_LABEL_METADATA.name,
    description: GMAIL_ADD_LABEL_METADATA.description,
    icon: Mail,
    providerId: "gmail",
    category: "Email",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
    requiresTriggerProvider: "gmail", // Only available when workflow has Gmail trigger
    configSchema: [
      { 
        name: "messageId", 
        label: "Email", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: true,
        description: "Choose from recent recipients or type custom email addresses",
        placeholder: "Enter email addresses...",
        multiple: true
      },
      { 
        name: "labelIds", 
        label: "Labels", 
        type: "select", 
        dynamic: "gmail_labels",
        required: true,
        placeholder: "Select or enter one or more labels",
        description: "Choose from your Gmail labels or enter new ones (supports multiple selection)",
        multiple: true,
        creatable: true // Allow custom label entry
      },
      { 
        name: "labelNames", 
        label: "New Labels", 
        type: "text", 
        required: false,
        description: "New label names to create (automatically populated when typing new labels)",
        hidden: true // This field is hidden and managed by the UI
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
      { 
        name: "emailAddress", 
        label: "Email Addresses", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: false,
        multiple: true,
        placeholder: "Enter email addresses...",
        description: "Choose from recent recipients or type custom email addresses"
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
        defaultValue: "1"
      },
      { 
        name: "query", 
        label: "Search Query", 
        type: "text",
        required: false,
        placeholder: "Enter Gmail search query (optional)",
        description: "Use Gmail search operators like 'from:', 'to:', 'subject:', 'has:attachment', etc."
      },
    ],
  },
  {
    type: "microsoft-outlook_action_add_folder",
    title: "Add to Folder (Outlook)",
    description: "Move an email to a specific folder",
    icon: Edit,
    providerId: "microsoft-outlook",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["Mail.ReadWrite"],
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
      { name: "folderId", label: "Destination Folder", type: "select", required: true, dynamic: "outlook_folders", placeholder: "Select a folder" },
    ],
  },
  {
    type: "microsoft-outlook_action_archive_email",
    title: "Archive Email (Outlook)",
    description: "Archive an email",
    icon: Edit,
    providerId: "microsoft-outlook",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["Mail.ReadWrite"],
    configSchema: [{ name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" }],
  },
  {
    type: "microsoft-outlook_action_search_email",
    title: "Search Email (Outlook)",
    description: "Search for a specific email",
    icon: Edit,
    providerId: "microsoft-outlook",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["Mail.Read"],
    configSchema: [
      { name: "query", label: "Search Query", type: "text", required: true, placeholder: "Enter search terms (e.g., from:john@example.com subject:meeting)" },
      { name: "folderId", label: "Search in Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select a folder (optional, searches all folders if not specified)" },
    ],
  },

  // Teams / Slack / Discord Triggers and Actions
  {
    type: "slack_trigger_slash_command",
    title: "Slash Command (Slack)",
    description: "Triggers when a slash command is used",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [{ name: "command", label: "Command", type: "text" }],
  },
  {
    type: "slack_action_post_interactive",
    title: "Post Interactive Blocks (Slack)",
    description: "Post interactive blocks and buttons",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["chat:write"],
    comingSoon: true,
    configSchema: [
      { name: "channelId", label: "Channel ID", type: "text" },
      { name: "blocks", label: "Blocks (JSON)", type: "textarea" },
    ],
  },

  {
    type: "discord_trigger_slash_command",
    title: "Slash Command (Discord)",
    description: "Triggers when a slash command is used",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [{ name: "command", label: "Command", type: "text" }],
  },



  // ManyChat Triggers and Actions
  {
    type: "manychat_trigger_new_subscriber",
    title: "New Subscriber (ManyChat)",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "manychat",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: "manychat_action_send_message",
    title: "Send Message (ManyChat)",
    description: "Send a message to a subscriber",
    icon: Send,
    providerId: "manychat",
    category: "Communication",
    isTrigger: false,
  },
  {
    type: "manychat_action_tag_subscriber",
    title: "Tag Subscriber (ManyChat)",
    description: "Add a tag to a subscriber",
    icon: Edit,
    providerId: "manychat",
    category: "Communication",
    isTrigger: false,
  },

  // beehiiv Triggers and Actions
  {
    type: "beehiiv_trigger_new_subscriber",
    title: "New Subscriber (beehiiv)",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
  },
  {
    type: "beehiiv_action_add_subscriber",
    title: "Add Subscriber (beehiiv)",
    description: "Add a new subscriber",
    icon: Plus,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: false,
  },
  {
    type: "beehiiv_action_send_newsletter",
    title: "Send Newsletter (beehiiv)",
    description: "Send a newsletter to your subscribers",
    icon: Send,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: false,
  },

  // Google Docs Actions
  {
    type: "google_docs_action_create_document",
    title: "Create Document (Google Docs)",
    description: "Create a new Google Document with customizable content and properties",
    icon: PenSquare,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    configSchema: [
      {
        name: "title",
        label: "Document Title",
        type: "text",
        required: true,
        placeholder: "e.g., Meeting Notes, Project Report, Documentation",
        description: "The title of the new document"
      },
      {
        name: "content",
        label: "Initial Content",
        type: "textarea",
        required: false,
        placeholder: "Enter the initial content for your document...",
        description: "The initial content to add to the document (supports basic formatting)"
      },
      {
        name: "templateId",
        label: "Use Template",
        type: "select",
        required: false,
        dynamic: "google-docs_templates",
        placeholder: "Select a template (optional)",
        description: "Create document from an existing template"
      },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        required: false,
        dynamic: "google-drive-folders",
        placeholder: "Select a folder (optional, defaults to root)",
        description: "Choose where to create the document"
      },
      {
        name: "shareWith",
        label: "Share With",
        type: "text",
        required: false,
        placeholder: "email@example.com (comma-separated for multiple)",
        description: "Email addresses to share the document with (optional)"
      },
      {
        name: "permission",
        label: "Permission Level",
        type: "select",
        required: false,
        defaultValue: "writer",
        options: [
          { value: "reader", label: "Reader (view only)" },
          { value: "commenter", label: "Commenter (view and comment)" },
          { value: "writer", label: "Writer (view, comment, and edit)" }
        ],
        description: "Permission level for shared users"
      }
    ],
  },
  {
    type: "google_docs_action_update_document",
    title: "Update Document (Google Docs)",
    description: "Update content in an existing Google Document",
    icon: Edit,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_recent_documents",
        required: true,
        placeholder: "Select a document from your Google Docs",
        description: "Choose from your recently modified Google Docs documents"
      },
      {
        name: "operation",
        label: "Operation Type",
        type: "select",
        required: true,
        defaultValue: "insert",
        options: [
          { value: "insert", label: "Insert Text" },
          { value: "replace", label: "Replace Text" },
          { value: "delete", label: "Delete Text" },
          { value: "append", label: "Append to End" }
        ],
        description: "Type of operation to perform on the document"
      },
      {
        name: "content",
        label: "Content",
        type: "textarea",
        required: true,
        placeholder: "Enter the content to insert, replace, or append...",
        description: "The content to add to the document"
      },
      {
        name: "location",
        label: "Location (for insert/replace)",
        type: "text",
        required: false,
        placeholder: "e.g., 'Hello' or '1:100' (start:end index)",
        description: "Text to find or index range for the operation"
      },
      {
        name: "formatting",
        label: "Apply Formatting",
        type: "select",
        required: false,
        defaultValue: "none",
        options: [
          { value: "none", label: "No formatting" },
          { value: "bold", label: "Bold" },
          { value: "italic", label: "Italic" },
          { value: "underline", label: "Underline" },
          { value: "heading1", label: "Heading 1" },
          { value: "heading2", label: "Heading 2" },
          { value: "heading3", label: "Heading 3" }
        ],
        description: "Text formatting to apply"
      }
    ],
  },
  {
    type: "google_docs_action_share_document",
    title: "Share Document (Google Docs)",
    description: "Share a Google Document with specific users or make it public",
    icon: Share,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.readonly"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_recent_documents",
        required: true,
        placeholder: "Select a document from your Google Docs",
        description: "Choose from your recently modified Google Docs documents"
      },
      {
        name: "shareWith",
        label: "Share With",
        type: "text",
        required: true,
        placeholder: "email@example.com (comma-separated for multiple)",
        description: "Email addresses to share the document with"
      },
      {
        name: "permission",
        label: "Permission Level",
        type: "select",
        required: true,
        defaultValue: "writer",
        options: [
          { value: "reader", label: "Reader (view only)" },
          { value: "commenter", label: "Commenter (view and comment)" },
          { value: "writer", label: "Writer (view, comment, and edit)" },
          { value: "owner", label: "Owner (full control)" }
        ],
        description: "Permission level for shared users"
      },
      {
        name: "sendNotification",
        label: "Send Notification Email",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Whether to send an email notification to shared users"
      },
      {
        name: "message",
        label: "Custom Message",
        type: "textarea",
        required: false,
        placeholder: "Optional message to include in the sharing notification...",
        description: "Custom message to include in the sharing email"
      }
    ],
  },
  {
    type: "google_docs_action_export_document",
    title: "Export Document (Google Docs)",
    description: "Export a Google Doc to various formats (PDF, DOCX, etc.)",
    icon: Download,
    providerId: "google-docs",
    requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "documentId", label: "Document", type: "select", dynamic: "google-docs_recent_documents", required: true, placeholder: "Select a document to export" },
      { name: "exportFormat", label: "Export Format", type: "select", required: true, defaultValue: "pdf", options: [
        { value: "pdf", label: "PDF" },
        { value: "docx", label: "Microsoft Word (.docx)" },
        { value: "txt", label: "Plain Text (.txt)" },
        { value: "html", label: "HTML" },
        { value: "rtf", label: "Rich Text Format (.rtf)" }
      ] },
      { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "Custom file name (optional)" }
    ]
  },

  // GitHub Actions
  {
    type: "github_action_create_repository",
    title: "Create Repository (GitHub)",
    description: "Create a new GitHub repository",
    icon: GitBranch,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Repository Name", type: "text", required: true, placeholder: "Enter repository name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Repository description" },
      { name: "isPrivate", label: "Private Repository", type: "boolean", required: false, defaultValue: false },
      { name: "autoInit", label: "Initialize with README", type: "boolean", required: false, defaultValue: true },
      { name: "license", label: "License", type: "select", required: false, options: [
        { value: "mit", label: "MIT License" },
        { value: "apache-2.0", label: "Apache License 2.0" },
        { value: "gpl-3.0", label: "GNU General Public License v3.0" },
        { value: "bsd-3-clause", label: "BSD 3-Clause License" }
      ] }
    ]
  },
  {
    type: "github_action_create_pull_request",
    title: "Create Pull Request (GitHub)",
    description: "Create a new pull request",
    icon: GitPullRequest,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/repo-name" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Pull request title" },
      { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Pull request description" },
      { name: "head", label: "Source Branch", type: "text", required: true, placeholder: "feature-branch" },
      { name: "base", label: "Target Branch", type: "text", required: true, defaultValue: "main", placeholder: "main" }
    ]
  },
  {
    type: "github_action_create_gist",
    title: "Create Gist (GitHub)",
    description: "Create a new GitHub Gist",
    icon: FileText,
    providerId: "github",
    requiredScopes: ["gist"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Gist description" },
      { name: "filename", label: "Filename", type: "text", required: true, placeholder: "example.js" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Enter file content" },
      { name: "isPublic", label: "Public Gist", type: "boolean", required: false, defaultValue: false }
    ]
  },
  {
    type: "github_action_add_comment",
    title: "Add Comment (GitHub)",
    description: "Add a comment to an issue or pull request",
    icon: MessageSquare,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/repo-name" },
      { name: "issueNumber", label: "Issue/PR Number", type: "number", required: true, placeholder: "123" },
      { name: "body", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment" }
    ]
  },

  // GitLab Actions
  {
    type: "gitlab_action_create_project",
    title: "Create Project (GitLab)",
    description: "Create a new GitLab project",
    icon: GitBranch,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Project Name", type: "text", required: true, placeholder: "Enter project name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Project description" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
        { value: "private", label: "Private" },
        { value: "internal", label: "Internal" },
        { value: "public", label: "Public" }
      ] },
      { name: "initializeWithReadme", label: "Initialize with README", type: "boolean", required: false, defaultValue: true }
    ]
  },
  {
    type: "gitlab_action_create_merge_request",
    title: "Create Merge Request (GitLab)",
    description: "Create a new merge request",
    icon: GitPullRequest,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "projectId", label: "Project ID", type: "number", required: true, placeholder: "123" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Merge request title" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Merge request description" },
      { name: "sourceBranch", label: "Source Branch", type: "text", required: true, placeholder: "feature-branch" },
      { name: "targetBranch", label: "Target Branch", type: "text", required: true, defaultValue: "main", placeholder: "main" }
    ]
  },
  {
    type: "gitlab_action_create_issue",
    title: "Create Issue (GitLab)",
    description: "Create a new issue in a GitLab project",
    icon: AlertCircle,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "projectId", label: "Project ID", type: "number", required: true, placeholder: "123" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Issue title" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Issue description" },
      { name: "labels", label: "Labels", type: "text", required: false, placeholder: "bug,urgent" }
    ]
  },

  // Facebook Actions
  {
    type: "facebook_action_create_post",
    title: "Create Post (Facebook)",
    description: "Create a new post on a Facebook page",
    icon: Share,
    providerId: "facebook",
    requiredScopes: ["pages_manage_posts"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Enter post title" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your post message" },
      { name: "link", label: "Link", type: "text", required: false, placeholder: "https://example.com" },
      { name: "scheduledPublishTime", label: "Schedule Publish Time", type: "datetime", required: false }
    ]
  },
  {
    type: "facebook_action_get_page_insights",
    title: "Get Page Insights (Facebook)",
    description: "Get analytics data for a Facebook page",
    icon: BarChart,
    providerId: "facebook",
    requiredScopes: ["pages_read_engagement"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page" },
      { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "page_impressions", options: [
        { value: "page_impressions", label: "Page Impressions" },
        { value: "page_engaged_users", label: "Engaged Users" },
        { value: "page_post_engagements", label: "Post Engagements" },
        { value: "page_fans", label: "Page Fans" }
      ] },
      { name: "period", label: "Period", type: "select", required: true, defaultValue: "day", options: [
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" }
      ] },
      { name: "periodCount", label: "Number of Days", type: "number", required: true, defaultValue: 7, placeholder: "7", dependsOn: "period" }
    ]
  },

  // Instagram Actions
  {
    type: "instagram_action_create_story",
    title: "Create Story (Instagram)",
    description: "Create a new Instagram story",
    icon: Camera,
    providerId: "instagram",
    requiredScopes: ["instagram_business_content_publish"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "imageUrl", label: "Image URL", type: "text", required: true, placeholder: "https://example.com/image.jpg" },
      { name: "caption", label: "Caption", type: "textarea", required: false, placeholder: "Story caption" },
      { name: "locationId", label: "Location ID", type: "text", required: false, placeholder: "Instagram location ID" }
    ]
  },
  {
    type: "instagram_action_get_media_insights",
    title: "Get Media Insights (Instagram)",
    description: "Get analytics for Instagram media",
    icon: BarChart,
    providerId: "instagram",
    requiredScopes: ["instagram_basic"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "mediaId", label: "Media ID", type: "text", required: true, placeholder: "Enter Instagram media ID" },
      { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "impressions", options: [
        { value: "impressions", label: "Impressions" },
        { value: "reach", label: "Reach" },
        { value: "engagement", label: "Engagement" },
        { value: "saved", label: "Saved" }
      ] }
    ]
  },

  // LinkedIn Actions
  {
    type: "linkedin_action_share_post",
    title: "Share Post (LinkedIn)",
    description: "Share a post on LinkedIn",
    icon: Share,
    providerId: "linkedin",
    requiredScopes: ["w_member_social"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "text", label: "Post Text", type: "textarea", required: true, placeholder: "Enter your LinkedIn post" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "PUBLIC", options: [
        { value: "PUBLIC", label: "Public" },
        { value: "CONNECTIONS", label: "Connections" }
      ] }
    ]
  },
  {
    type: "linkedin_action_create_company_post",
    title: "Create Company Post (LinkedIn)",
    description: "Create a post on a LinkedIn company page",
    icon: Building,
    providerId: "linkedin",
    requiredScopes: ["w_organization_social"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "organizationId", label: "Organization ID", type: "text", required: true, placeholder: "Enter organization ID" },
      { name: "text", label: "Post Text", type: "textarea", required: true, placeholder: "Enter your company post" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "PUBLIC", options: [
        { value: "PUBLIC", label: "Public" },
        { value: "LOGGED_IN", label: "Logged-in users" }
      ] }
    ]
  },

  // TikTok Actions
  {
    type: "tiktok_action_get_user_info",
    title: "Get User Info (TikTok)",
    description: "Get information about a TikTok user",
    icon: User,
    providerId: "tiktok",
    requiredScopes: ["user.info.basic"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username" }
    ]
  },
  {
    type: "tiktok_action_get_video_list",
    title: "Get Video List (TikTok)",
    description: "Get a list of videos from a TikTok user",
    icon: Video,
    providerId: "tiktok",
    requiredScopes: ["video.list"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username" },
      { name: "maxCount", label: "Max Count", type: "number", required: false, defaultValue: 20, placeholder: "20" }
    ]
  },

  // Notion Actions
  {
    type: "notion_action_create_database",
    title: "Create Database (Notion)",
    description: "Create a new database in Notion with advanced configuration",
    icon: Database,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "workspace", 
        label: "Workspace", 
        type: "select", 
        dynamic: "notion_workspaces",
        required: true,
        placeholder: "Select Notion workspace"
      },
      { 
        name: "template", 
        label: "Template", 
        type: "select", 
        required: false,
        options: [
          { value: "Project Tracker", label: "Project Tracker" },
          { value: "CRM", label: "CRM" },
          { value: "Content Calendar", label: "Content Calendar" },
          { value: "Task Management", label: "Task Management" },
          { value: "Bug Tracker", label: "Bug Tracker" },
          { value: "Feature Requests", label: "Feature Requests" },
          { value: "Customer Support", label: "Customer Support" },
          { value: "Sales Pipeline", label: "Sales Pipeline" },
          { value: "Marketing Campaigns", label: "Marketing Campaigns" },
          { value: "Event Planning", label: "Event Planning" },
          { value: "Product Roadmap", label: "Product Roadmap" },
          { value: "Team Directory", label: "Team Directory" },
          { value: "Knowledge Base", label: "Knowledge Base" },
          { value: "Inventory Management", label: "Inventory Management" },
          { value: "Expense Tracker", label: "Expense Tracker" },
          { value: "Time Tracking", label: "Time Tracking" },
          { value: "Meeting Notes", label: "Meeting Notes" },
          { value: "Research Database", label: "Research Database" },
          { value: "Learning Management", label: "Learning Management" }
        ],
        placeholder: "Select template (optional)"
      },
      { 
        name: "databaseType", 
        label: "Database Type", 
        type: "select", 
        required: true,
        defaultValue: "Full page",
        options: [
          { value: "Full page", label: "Full page" },
          { value: "Inline", label: "Inline" }
        ],
        placeholder: "Select database type"
      },
      { 
        name: "title", 
        label: "Title", 
        type: "text", 
        required: true, 
        placeholder: "Enter database title" 
      },
      { 
        name: "description", 
        label: "Description", 
        type: "textarea", 
        required: false, 
        placeholder: "Enter database description (optional)" 
      },
      { 
        name: "icon", 
        label: "Icon", 
        type: "custom", 
        required: false,
        description: "Upload or provide URL for database icon"
      },
      { 
        name: "cover", 
        label: "Cover", 
        type: "custom", 
        required: false,
        description: "Upload or provide URL for database cover image"
      },
      { 
        name: "properties", 
        label: "Properties", 
        type: "custom", 
        required: true,
        description: "Configure database properties with types and options"
      },
      { 
        name: "views", 
        label: "Views", 
        type: "custom", 
        required: false,
        description: "Configure database views (optional)"
      }
    ],
    outputSchema: [
      {
        name: "databaseId",
        label: "Database ID",
        type: "string",
        description: "The unique ID of the created database"
      },
      {
        name: "databaseTitle",
        label: "Database Title",
        type: "string",
        description: "The title of the created database"
      },
      {
        name: "databaseUrl",
        label: "Database URL",
        type: "string",
        description: "The URL to access the database in Notion"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the database was created"
      },
      {
        name: "lastEditedTime",
        label: "Last Edited Time",
        type: "string",
        description: "When the database was last edited"
      }
    ]
  },
  {
    type: "notion_action_search_pages",
    title: "Search Pages (Notion)",
    description: "Search for pages in Notion",
    icon: Search,
    providerId: "notion",
    requiredScopes: ["content.read"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "query", label: "Search Query", type: "text", required: false, placeholder: "Enter search terms" },
      { name: "filter", label: "Filter", type: "select", required: false, options: [
        { value: "page", label: "Pages" },
        { value: "database", label: "Databases" }
      ] },
      { name: "maxResults", label: "Max Results", type: "number", required: false, defaultValue: 10, placeholder: "10" }
    ]
  },
  {
    type: "notion_action_update_page",
    title: "Update Page (Notion)",
    description: "Update an existing Notion page",
    icon: Edit,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "page", label: "Page", type: "select", dynamic: "notion_pages", required: true, placeholder: "Select a page" },
      { name: "title", label: "New Title", type: "text", required: false, placeholder: "New page title" },
      { name: "content", label: "Content", type: "textarea", required: false, placeholder: "New page content" }
    ]
  },

  // Trello Actions
  {
    type: "trello_action_create_board",
    title: "Create Board (Trello)",
    description: "Create a new Trello board",
    icon: Layout,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Board Name", type: "text", required: true, placeholder: "Enter board name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Board description" },
      { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" },
        { value: "workspace", label: "Workspace" }
      ] }
    ]
  },
  {
    type: "trello_action_create_list",
    title: "Create List (Trello)",
    description: "Create a new list on a Trello board",
    icon: List,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello-boards", placeholder: "Select a board" },
      { name: "name", label: "List Name", type: "text", required: true, placeholder: "Enter list name" }
    ]
  },
  {
    type: "trello_action_move_card",
    title: "Move Card (Trello)",
    description: "Move a card to a different list",
    icon: Move,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", required: true, dynamic: "trello-boards", placeholder: "Select a board" },
      { name: "cardId", label: "Card", type: "select", required: true, dynamic: "trello_cards", dependsOn: "boardId", placeholder: "Select a card to move" },
      { name: "listId", label: "Target List", type: "select", required: true, dynamic: "trello_lists", dependsOn: "boardId", placeholder: "Select target list" },
      { name: "position", label: "Position", type: "select", required: false, defaultValue: "bottom", options: [
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" }
      ] }
    ]
  },

  // HubSpot Actions
  {
    type: "hubspot_action_create_company",
    title: "Create Company (HubSpot)",
    description: "Create a new company in HubSpot",
    icon: Building,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.companies.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Company Name", type: "text", required: true, placeholder: "Enter company name" },
      { name: "domain", label: "Domain", type: "text", required: false, placeholder: "example.com" },
      { name: "phone", label: "Phone", type: "text", required: false, placeholder: "+1-555-123-4567" },
      { name: "address", label: "Address", type: "textarea", required: false, placeholder: "Company address" },
      { name: "industry", label: "Industry", type: "text", required: false, placeholder: "Technology" }
    ]
  },
  {
    type: "hubspot_action_create_deal",
    title: "Create Deal (HubSpot)",
    description: "Create a new deal in HubSpot",
    icon: DollarSign,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.deals.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      { name: "dealName", label: "Deal Name", type: "text", required: true, placeholder: "Enter deal name" },
      { name: "amount", label: "Amount", type: "number", required: false, placeholder: "10000" },
      { 
        name: "pipeline", 
        label: "Pipeline", 
        type: "combobox",
        dynamic: "hubspot_pipelines",
        required: false,
        placeholder: "Select a pipeline or type to create new",
        creatable: true
      },
      { 
        name: "stage", 
        label: "Stage", 
        type: "combobox",
        dynamic: "hubspot_deal_stages",
        required: false,
        placeholder: "Select a stage or type to create new",
        dependsOn: "pipeline",
        creatable: true
      },
      { name: "closeDate", label: "Close Date", type: "date", required: false }
    ]
  },
  {
    type: "hubspot_action_add_contact_to_list",
    title: "Add Contact to List (HubSpot)",
    description: "Add a contact to a HubSpot list",
    icon: Users,
    providerId: "hubspot",
    requiredScopes: ["lists.read", "lists.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      { 
        name: "contactId", 
        label: "Contact", 
        type: "combobox",
        dynamic: "hubspot_contacts",
        required: true,
        placeholder: "Select a contact or type to create new",
        creatable: true
      },
      { 
        name: "listId", 
        label: "List", 
        type: "combobox",
        dynamic: "hubspot_lists",
        required: true,
        placeholder: "Select a list or type to create new",
        creatable: true
      }
    ]
  },
  {
    type: "hubspot_action_update_deal",
    title: "Update Deal (HubSpot)",
    description: "Update an existing deal in HubSpot",
    icon: Edit,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.deals.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      { 
        name: "dealId", 
        label: "Deal", 
        type: "select",
        dynamic: "hubspot_deals",
        required: true,
        placeholder: "Select a deal to update"
      },
      { name: "dealName", label: "Deal Name", type: "text", required: false },
      { name: "amount", label: "Amount", type: "number", required: false },
      { 
        name: "pipeline", 
        label: "Pipeline", 
        type: "combobox",
        dynamic: "hubspot_pipelines",
        required: false,
        placeholder: "Select a pipeline or type to create new",
        creatable: true
      },
      { 
        name: "stage", 
        label: "Stage", 
        type: "combobox",
        dynamic: "hubspot_deal_stages",
        required: false,
        placeholder: "Select a stage or type to create new",
        dependsOn: "pipeline",
        creatable: true
      },
      { name: "closeDate", label: "Close Date", type: "date", required: false }
    ]
  },

  // Airtable Actions
  {
    type: "airtable_action_update_record",
    title: "Update Record (Airtable)",
    description: "Update an existing record in Airtable",
    icon: Edit,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to update records in",
        dependsOn: "baseId"
      },
      {
        name: "recordId",
        label: "Record",
        type: "select",
        dynamic: "airtable_records",
        required: true,
        placeholder: "Select a record to update",
        description: "Choose the record to update",
        dependsOn: "tableName"
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: false,
        placeholder: "Select status",
        description: "Set the status for the updated record",
        options: [
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" }
        ]
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "custom",
        required: true,
        description: "Configure the fields and values for the updated record",
        dependsOn: "tableName"
      }
    ]
  },
  {
    type: "airtable_action_move_record",
    title: "Move Record (Airtable)",
    description: "Move a record from one table to another in Airtable",
    icon: Move,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "sourceTableName",
        label: "Source Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select source table",
        description: "Choose the table to move the record from",
        dependsOn: "baseId"
      },
      {
        name: "recordId",
        label: "Record",
        type: "select",
        dynamic: "airtable_records",
        required: true,
        placeholder: "Select a record to move",
        description: "Choose the record to move",
        dependsOn: "sourceTableName"
      },
      {
        name: "destinationTableName",
        label: "Destination Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select destination table",
        description: "Choose the table to move the record to",
        dependsOn: "baseId"
      },
      {
        name: "preserveRecordId",
        label: "Preserve Record ID",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Keep the same record ID in the destination table"
      }
    ]
  },
  {
    type: "airtable_action_list_records",
    title: "List Records (Airtable)",
    description: "List records from an Airtable table",
    icon: List,
    providerId: "airtable",
    requiredScopes: ["data.records:read"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to list records from",
        dependsOn: "baseId"
      },
      {
        name: "maxRecords",
        label: "Max Records",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "100",
        description: "Maximum number of records to return"
      },
      {
        name: "filterByFormula",
        label: "Filter Formula",
        type: "text",
        required: false,
        placeholder: "{Status} = 'Active'",
        description: "Airtable filter formula to apply to the records"
      }
    ]
  },

  // Shopify Actions
  {
    type: "shopify_action_create_order",
    title: "Create Order (Shopify)",
    description: "Create a new order in Shopify",
    icon: ShoppingCart,
    providerId: "shopify",
    requiredScopes: ["write_orders"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "email", label: "Customer Email", type: "email", required: true, placeholder: "customer@example.com" },
      { name: "lineItems", label: "Line Items (JSON)", type: "textarea", required: true, placeholder: '[{"variant_id": 123, "quantity": 1}]' },
      { name: "financialStatus", label: "Financial Status", type: "select", required: false, defaultValue: "pending", options: [
        { value: "pending", label: "Pending" },
        { value: "paid", label: "Paid" },
        { value: "refunded", label: "Refunded" }
      ] },
      { name: "fulfillmentStatus", label: "Fulfillment Status", type: "select", required: false, defaultValue: "unfulfilled", options: [
        { value: "unfulfilled", label: "Unfulfilled" },
        { value: "fulfilled", label: "Fulfilled" }
      ] }
    ]
  },
  {
    type: "shopify_action_update_product",
    title: "Update Product (Shopify)",
    description: "Update an existing product in Shopify",
    icon: Edit,
    providerId: "shopify",
    requiredScopes: ["write_products"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "productId", label: "Product ID", type: "text", required: true, placeholder: "Enter product ID" },
      { name: "title", label: "Title", type: "text", required: false, placeholder: "New product title" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "New product description" },
      { name: "status", label: "Status", type: "select", required: false, options: [
        { value: "active", label: "Active" },
        { value: "draft", label: "Draft" },
        { value: "archived", label: "Archived" }
      ] }
    ]
  },
  {
    type: "shopify_action_create_customer",
    title: "Create Customer (Shopify)",
    description: "Create a new customer in Shopify",
    icon: UserPlus,
    providerId: "shopify",
    requiredScopes: ["write_customers"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "email", label: "Email", type: "email", required: true, placeholder: "customer@example.com" },
      { name: "firstName", label: "First Name", type: "text", required: false, placeholder: "John" },
      { name: "lastName", label: "Last Name", type: "text", required: false, placeholder: "Doe" },
      { name: "phone", label: "Phone", type: "text", required: false, placeholder: "+1-555-123-4567" },
      { name: "tags", label: "Tags", type: "text", required: false, placeholder: "vip,wholesale" }
    ]
  },

  // Stripe Actions
  {
    type: "stripe_action_create_payment_intent",
    title: "Create Payment Intent (Stripe)",
    description: "Create a new payment intent in Stripe",
    icon: CreditCard,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "amount", label: "Amount (cents)", type: "number", required: true, placeholder: "1000" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "usd", options: [
        { value: "usd", label: "USD" },
        { value: "eur", label: "EUR" },
        { value: "gbp", label: "GBP" }
      ] },
      { name: "customerId", label: "Customer ID", type: "text", required: false, placeholder: "cus_1234567890" },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Payment description" }
    ]
  },
  {
    type: "stripe_action_create_invoice",
    title: "Create Invoice (Stripe)",
    description: "Create a new invoice in Stripe",
    icon: FileText,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Invoice description" },
      { name: "autoAdvance", label: "Auto Advance", type: "boolean", required: false, defaultValue: true }
    ]
  },
  {
    type: "stripe_action_create_subscription",
    title: "Create Subscription (Stripe)",
    description: "Create a new subscription in Stripe",
    icon: Repeat,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
      { name: "priceId", label: "Price ID", type: "text", required: true, placeholder: "price_1234567890" },
      { name: "trialPeriodDays", label: "Trial Period (days)", type: "number", required: false, placeholder: "7" }
    ]
  },

  // PayPal Actions
  {
    type: "paypal_action_create_order",
    title: "Create Order (PayPal)",
    description: "Create a new PayPal order",
    icon: ShoppingCart,
    providerId: "paypal",
    requiredScopes: ["openid"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "intent", label: "Intent", type: "select", required: true, defaultValue: "CAPTURE", options: [
        { value: "CAPTURE", label: "Capture" },
        { value: "AUTHORIZE", label: "Authorize" }
      ] },
      { name: "amount", label: "Amount", type: "number", required: true, placeholder: "10.00" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
        { value: "GBP", label: "GBP" }
      ] },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Order description" }
    ]
  },
  {
    type: "paypal_action_create_payout",
    title: "Create Payout (PayPal)",
    description: "Create a payout to a PayPal account",
    icon: Send,
    providerId: "paypal",
    requiredScopes: ["openid"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "email", label: "PayPal Email", type: "email", required: true, placeholder: "recipient@example.com" },
      { name: "amount", label: "Amount", type: "number", required: true, placeholder: "10.00" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
        { value: "GBP", label: "GBP" }
      ] },
      { name: "note", label: "Note", type: "text", required: false, placeholder: "Payout note" }
    ]
  },

  // Box Actions
  {
    type: "box_action_upload_file",
    title: "Upload File (Box)",
    description: "Upload a file to Box",
    icon: Upload,
    providerId: "box",
    requiredScopes: ["root_readwrite"],
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { 
        name: "fileName", 
        label: "File Name", 
        type: "text", 
        required: true,
        placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
        description: "File name for the created file. Will be automatically populated when you upload files."
      },
      { 
        name: "fileContent", 
        label: "File Content", 
        type: "textarea", 
        required: false,
        placeholder: "Enter file content (optional if uploading files)",
        description: "Text content for the file. Leave empty if uploading files."
      },
      { 
        name: "uploadedFiles", 
        label: "Upload Files", 
        type: "file", 
        required: false,
        placeholder: "Choose files to upload...",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
        maxSize: 50 * 1024 * 1024, // 50MB limit for Box
        description: "Upload files to create in Box. Files will be created with their original names and content. The file name field will be auto-populated."
      },
      {
        name: "parentFolderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "box-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
        description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
      },
    ]
  },
  {
    type: "box_action_create_folder",
    title: "Create Folder (Box)",
    description: "Create a new folder in Box",
    icon: FolderPlus,
    providerId: "box",
    requiredScopes: ["root_readwrite"],
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { name: "parentFolderId", label: "Parent Folder ID", type: "text", required: true, placeholder: "Enter parent folder ID" },
      { name: "folderName", label: "Folder Name", type: "text", required: true, placeholder: "Enter folder name" }
    ]
  },
  {
    type: "box_action_share_file",
    title: "Share File (Box)",
    description: "Share a file from Box",
    icon: Share,
    providerId: "box",
    requiredScopes: ["root_readwrite"],
    category: "Storage",
    isTrigger: false,
    configSchema: [
      { name: "fileId", label: "File ID", type: "text", required: true, placeholder: "Enter file ID" },
      { name: "access", label: "Access Level", type: "select", required: true, defaultValue: "open", options: [
        { value: "open", label: "Open" },
        { value: "company", label: "Company" },
        { value: "collaborators", label: "Collaborators" }
      ] },
      { name: "expiresAt", label: "Expires At", type: "datetime", required: false }
    ]
  },

  // Microsoft Outlook Actions
  {
    type: "microsoft-outlook_action_send_email",
    title: "Send Email (Outlook)",
    description: "Send an email through Microsoft Outlook",
    icon: Mail,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Send"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "to", label: "To", type: "email-autocomplete", required: true, placeholder: "Enter recipient email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "cc", label: "CC", type: "email-autocomplete", required: false, placeholder: "Enter CC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "bcc", label: "BCC", type: "email-autocomplete", required: false, placeholder: "Enter BCC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Email subject" },
      { name: "body", label: "Body", type: "rich-text", required: true, placeholder: "Compose your email message..." },
      { name: "attachments", label: "Attachments", type: "file", required: false, placeholder: "Select files to attach", multiple: true, description: "Attach files from your computer or select files from previous workflow nodes" }
    ]
  },
  {
    type: "microsoft-outlook_action_create_calendar_event",
    title: "Create Calendar Event (Outlook)",
    description: "Create a new calendar event in Outlook",
    icon: Calendar,
    providerId: "microsoft-outlook",
    requiredScopes: ["Calendars.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Calendar Section
      { name: "calendarId", label: "Calendar", type: "combobox", required: false, creatable: true, dynamic: "outlook_calendars", placeholder: "Select a calendar or type to create new" },
      
      // General Section
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Event subject" },
      { name: "isAllDay", label: "All Day", type: "boolean", required: false, defaultValue: false },
      { name: "startDate", label: "Start Date", type: "date", required: true, defaultValue: "today" },
      { name: "startTime", label: "Start Time", type: "time", required: true, defaultValue: "next-hour" },
      { name: "endDate", label: "End Date", type: "date", required: true, defaultValue: "same-as-start" },
      { name: "endTime", label: "End Time", type: "time", required: true, defaultValue: "1-hour-after-start" },
      { name: "timeZone", label: "Time Zone", type: "combobox", required: false, defaultValue: "user-timezone", creatable: true, placeholder: "Select or type timezone", options: [
        { value: "user-timezone", label: "Your timezone (auto-detected)" },
        { value: "America/New_York", label: "Eastern Time (ET)" },
        { value: "America/Chicago", label: "Central Time (CT)" },
        { value: "America/Denver", label: "Mountain Time (MT)" },
        { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
        { value: "America/Anchorage", label: "Alaska Time (AKT)" },
        { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
        { value: "UTC", label: "UTC (Coordinated Universal Time)" },
        { value: "Europe/London", label: "London (GMT/BST)" },
        { value: "Europe/Paris", label: "Paris (CET/CEST)" },
        { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
        { value: "Europe/Moscow", label: "Moscow (MSK)" },
        { value: "Asia/Tokyo", label: "Tokyo (JST)" },
        { value: "Asia/Shanghai", label: "Shanghai (CST)" },
        { value: "Asia/Dubai", label: "Dubai (GST)" },
        { value: "Asia/Kolkata", label: "Mumbai (IST)" },
        { value: "Australia/Sydney", label: "Sydney (AEDT/AEST)" },
        { value: "Pacific/Auckland", label: "Auckland (NZDT/NZST)" }
      ], description: "Your timezone will be automatically detected and set as the default" },
      { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Event description" },
      { name: "attendees", label: "Attendees", type: "email-autocomplete", required: false, placeholder: "Enter attendee email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "location", label: "Location", type: "location-autocomplete", required: false, placeholder: "Enter location or address" },
      { name: "locations", label: "Additional Locations", type: "text", required: false, placeholder: "Additional location details" },
      
      // Scheduling Section
      { name: "recurrence", label: "Repeat", type: "select", required: false, defaultValue: "none", options: [
        { value: "none", label: "Does not repeat" },
        { value: "RRULE:FREQ=DAILY", label: "Daily" },
        { value: "RRULE:FREQ=WEEKLY", label: "Weekly" },
        { value: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday (Monday to Friday)" },
        { value: "RRULE:FREQ=MONTHLY", label: "Monthly" },
        { value: "RRULE:FREQ=YEARLY", label: "Annually" }
      ]},
      { name: "showAs", label: "Show as", type: "select", required: false, defaultValue: "free", options: [
        { value: "free", label: "Free" },
        { value: "busy", label: "Busy" },
        { value: "tentative", label: "Tentative" },
        { value: "oof", label: "Out of office" }
      ]},
      
      // Notifications Section
      { name: "isReminderOn", label: "Enable reminder", type: "boolean", required: false, defaultValue: true },
      { name: "reminderMinutesBeforeStart", label: "Reminder time", type: "select", required: false, defaultValue: "30", options: [
        { value: "0", label: "At start time" },
        { value: "5", label: "5 minutes before" },
        { value: "10", label: "10 minutes before" },
        { value: "15", label: "15 minutes before" },
        { value: "30", label: "30 minutes before" },
        { value: "60", label: "1 hour before" },
        { value: "120", label: "2 hours before" },
        { value: "1440", label: "1 day before" },
        { value: "2880", label: "2 days before" },
        { value: "10080", label: "1 week before" }
      ]},
      { name: "allowNewTimeProposals", label: "Allow time proposals", type: "boolean", required: false, defaultValue: true, description: "Allow attendees to propose new meeting times" },
      { name: "responseRequested", label: "Response requested", type: "boolean", required: false, defaultValue: true, description: "Request responses from attendees" },
      
      // Online Meeting Section
      { name: "isOnlineMeeting", label: "Add online meeting", type: "boolean", required: false, defaultValue: false, description: "Automatically add a Teams meeting link to this event" },
      { name: "onlineMeetingProvider", label: "Online meeting provider", type: "select", required: false, defaultValue: "teamsForBusiness", options: [
        { value: "teamsForBusiness", label: "Microsoft Teams" },
        { value: "skypeForBusiness", label: "Skype for Business" },
        { value: "skypeForConsumer", label: "Skype for Consumer" }
      ]},
      
      // Classification Section
      { name: "categories", label: "Categories", type: "combobox", required: false, placeholder: "Type category name and press Tab to add", creatable: true, multiple: true },
      { name: "importance", label: "Importance", type: "select", required: false, defaultValue: "normal", options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" }
      ]},
      { name: "sensitivity", label: "Sensitivity", type: "select", required: false, defaultValue: "normal", options: [
        { value: "normal", label: "Normal" },
        { value: "personal", label: "Personal" },
        { value: "private", label: "Private" },
        { value: "confidential", label: "Confidential" }
      ]},
      
      // Advanced Section
      { name: "transactionId", label: "Transaction ID", type: "text", required: false, placeholder: "Custom transaction identifier" },
      { name: "hideAttendees", label: "Hide attendees", type: "boolean", required: false, defaultValue: false, description: "Hide attendee list from other attendees" },
      { name: "singleValueExtendedProperties", label: "Single-value extended properties", type: "textarea", required: false, placeholder: "JSON format: [{\"id\":\"property-id\",\"value\":\"property-value\"}]" },
      { name: "multiValueExtendedProperties", label: "Multi-value extended properties", type: "textarea", required: false, placeholder: "JSON format: [{\"id\":\"property-id\",\"values\":[\"value1\",\"value2\"]}]" },
      
      // Legacy/Compatibility Fields (mapped to new fields)
      { name: "reminderMinutes", label: "Notification (legacy)", type: "select", required: false, defaultValue: "30", options: [
        { value: "30", label: "30 minutes before" },
        { value: "0", label: "None" },
        { value: "5", label: "5 minutes before" },
        { value: "10", label: "10 minutes before" },
        { value: "15", label: "15 minutes before" },
        { value: "60", label: "1 hour before" },
        { value: "120", label: "2 hours before" },
        { value: "1440", label: "1 day before" },
        { value: "2880", label: "2 days before" },
        { value: "10080", label: "1 week before" }
      ], hidden: true },
      { name: "reminderMethod", label: "Notification method (legacy)", type: "select", required: false, defaultValue: "popup", options: [
        { value: "popup", label: "Notification" },
        { value: "email", label: "Email" }
      ], hidden: true },
      { name: "sendNotifications", label: "Send invitations (legacy)", type: "select", required: false, defaultValue: "all", options: [
        { value: "all", label: "Send to all attendees" },
        { value: "externalOnly", label: "Send to attendees outside your organization" },
        { value: "none", label: "Don't send" }
      ], hidden: true },
      { name: "guestsCanInviteOthers", label: "Guests can invite others (legacy)", type: "boolean", required: false, defaultValue: true, hidden: true },
      { name: "guestsCanSeeOtherGuests", label: "Guests can see guest list (legacy)", type: "boolean", required: false, defaultValue: true, hidden: true },
      { name: "guestsCanModify", label: "Guests can modify event (legacy)", type: "boolean", required: false, defaultValue: false, hidden: true },
      { name: "visibility", label: "Visibility (legacy)", type: "select", required: false, defaultValue: "public", options: [
        { value: "public", label: "Public" },
        { value: "private", label: "Private" }
      ], hidden: true }
    ]
  },
  {
    type: "microsoft-outlook_action_create_contact",
    title: "Create Contact (Outlook)",
    description: "Create a new contact in Outlook",
    icon: UserPlus,
    providerId: "microsoft-outlook",
    requiredScopes: ["Contacts.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "givenName", label: "First Name", type: "text", required: true, placeholder: "John" },
      { name: "surname", label: "Last Name", type: "text", required: true, placeholder: "Doe" },
      { name: "emailAddresses", label: "Email Addresses", type: "text", required: false, placeholder: "john.doe@example.com" },
      { name: "businessPhones", label: "Business Phone", type: "text", required: false, placeholder: "+1-555-123-4567" },
      { name: "companyName", label: "Company", type: "text", required: false, placeholder: "Company Name" },
      { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "Software Engineer" }
    ]
  },
  {
    type: "microsoft-outlook_action_move_email",
    title: "Move Email (Outlook)",
    description: "Move an email to a different folder",
    icon: Move,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
      { name: "sourceFolderId", label: "Source Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select source folder (optional)" },
      { name: "destinationFolderId", label: "Destination Folder", type: "select", required: true, dynamic: "outlook_folders", placeholder: "Select destination folder" },
    ]
  },
  {
    type: "microsoft-outlook_action_mark_as_read",
    title: "Mark Email as Read (Outlook)",
    description: "Mark an email as read",
    icon: Check,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
    ]
  },
  {
    type: "microsoft-outlook_action_mark_as_unread",
    title: "Mark Email as Unread (Outlook)",
    description: "Mark an email as unread",
    icon: X,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
    ]
  },
  {
    type: "microsoft-outlook_action_reply_to_email",
    title: "Reply to Email (Outlook)",
    description: "Reply to an existing email",
    icon: Reply,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Send"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
      { name: "body", label: "Reply Body", type: "textarea", required: true, placeholder: "Your reply message" },
      { name: "isHtml", label: "HTML Body", type: "boolean", required: false, defaultValue: false }
    ]
  },
  {
    type: "microsoft-outlook_action_forward_email",
    title: "Forward Email (Outlook)",
    description: "Forward an email to other recipients",
    icon: Forward,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Send"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
      { name: "to", label: "To", type: "email-autocomplete", required: true, placeholder: "Enter recipient email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "cc", label: "CC", type: "email-autocomplete", required: false, placeholder: "Enter CC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "bcc", label: "BCC", type: "email-autocomplete", required: false, placeholder: "Enter BCC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "body", label: "Additional Message", type: "textarea", required: false, placeholder: "Additional message to include with the forwarded email" },
    ]
  },
  {
    type: "microsoft-outlook_action_get_messages",
    title: "Get Messages (Outlook)",
    description: "Retrieve emails from a specific folder",
    icon: MailOpen,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Read"],
    category: "Communication",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { name: "folderId", label: "Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select a folder (uses inbox if not specified)" },
      { name: "limit", label: "Number of Messages", type: "select", required: false, defaultValue: "10", options: [
        { value: "5", label: "5 messages" },
        { value: "10", label: "10 messages" },
        { value: "25", label: "25 messages" },
        { value: "50", label: "50 messages" },
        { value: "100", label: "100 messages" }
      ]},
      { name: "unreadOnly", label: "Unread Only", type: "boolean", required: false, defaultValue: false },
    ]
  },
  {
    type: "microsoft-outlook_action_get_contacts",
    title: "Get Contacts (Outlook)",
    description: "Retrieve contacts from Outlook",
    icon: Users,
    providerId: "microsoft-outlook",
    requiredScopes: ["Contacts.Read"],
    category: "Communication",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { name: "limit", label: "Number of Contacts", type: "select", required: false, defaultValue: "50", options: [
        { value: "10", label: "10 contacts" },
        { value: "25", label: "25 contacts" },
        { value: "50", label: "50 contacts" },
        { value: "100", label: "100 contacts" },
        { value: "all", label: "All contacts" }
      ]},
    ]
  },
  {
    type: "microsoft-outlook_action_get_calendar_events",
    title: "Get Calendar Events (Outlook)",
    description: "Retrieve calendar events from Outlook",
    icon: Calendar,
    providerId: "microsoft-outlook",
    requiredScopes: ["Calendars.Read"],
    category: "Communication",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { name: "calendarId", label: "Calendar", type: "select", required: false, dynamic: "outlook_calendars", placeholder: "Select a calendar (uses default if not specified)" },
      { name: "startDate", label: "Start Date", type: "date", required: false, placeholder: "Start date for events" },
      { name: "endDate", label: "End Date", type: "date", required: false, placeholder: "End date for events" },
      { name: "limit", label: "Number of Events", type: "select", required: false, defaultValue: "25", options: [
        { value: "10", label: "10 events" },
        { value: "25", label: "25 events" },
        { value: "50", label: "50 events" },
        { value: "100", label: "100 events" }
      ]},
    ]
  },

  // Microsoft OneNote Actions
  {
    type: "microsoft-onenote_action_create_page",
    title: "Create Page (OneNote)",
    description: "Create a new page in OneNote",
    icon: FileText,
    providerId: "microsoft-onenote",
    requiredScopes: ["Notes.ReadWrite.All"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "notebookId", 
        label: "Notebook", 
        type: "combobox",
        dynamic: "onenote_notebooks",
        required: true,
        placeholder: "Select a notebook or type to create new",
        creatable: true
      },
      { 
        name: "sectionId", 
        label: "Section", 
        type: "combobox",
        dynamic: "onenote_sections",
        required: true,
        placeholder: "Select a section or type to create new",
        dependsOn: "notebookId",
        creatable: true
      },
      { name: "title", label: "Page Title", type: "text", required: true, placeholder: "Enter page title" },
      { name: "content", label: "Content", type: "textarea", required: false, placeholder: "Enter page content" }
    ]
  },
  {
    type: "microsoft-onenote_action_create_section",
    title: "Create Section (OneNote)",
    description: "Create a new section in OneNote",
    icon: FolderPlus,
    providerId: "microsoft-onenote",
    requiredScopes: ["Notes.ReadWrite.All"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "notebookId", 
        label: "Notebook", 
        type: "combobox",
        dynamic: "onenote_notebooks",
        required: true,
        placeholder: "Select a notebook or type to create new",
        creatable: true
      },
      { name: "displayName", label: "Section Name", type: "text", required: true, placeholder: "Enter section name" }
    ]
  },
  {
    type: "microsoft-onenote_action_update_page",
    title: "Update Page (OneNote)",
    description: "Update an existing OneNote page",
    icon: Edit,
    providerId: "microsoft-onenote",
    requiredScopes: ["Notes.ReadWrite.All"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "notebookId", 
        label: "Notebook", 
        type: "combobox",
        dynamic: "onenote_notebooks",
        required: true,
        placeholder: "Select a notebook or type to create new",
        creatable: true
      },
      { 
        name: "sectionId", 
        label: "Section", 
        type: "combobox",
        dynamic: "onenote_sections",
        required: true,
        placeholder: "Select a section or type to create new",
        dependsOn: "notebookId",
        creatable: true
      },
      { 
        name: "pageId", 
        label: "Page", 
        type: "combobox",
        dynamic: "onenote_pages",
        required: true,
        placeholder: "Select a page or type to create new",
        dependsOn: "sectionId",
        creatable: true
      },
      { name: "title", label: "New Title", type: "text", required: false, placeholder: "New page title" },
      { name: "content", label: "New Content", type: "textarea", required: false, placeholder: "New page content" }
    ]
  },

  // TikTok Triggers
  {
    type: "tiktok_trigger_new_video",
    title: "New Video (TikTok)",
    description: "Triggers when a new video is uploaded to TikTok",
    icon: Video,
    providerId: "tiktok",
    category: "Social",
    isTrigger: true,
    configSchema: [
      { name: "username", label: "Username", type: "text", required: true, placeholder: "Enter TikTok username to monitor" }
    ]
  },
  {
    type: "tiktok_trigger_new_comment",
    title: "New Comment (TikTok)",
    description: "Triggers when a new comment is posted on a TikTok video",
    icon: MessageSquare,
    providerId: "tiktok",
    category: "Social",
    isTrigger: true,
    configSchema: [
      { name: "videoId", label: "Video ID", type: "text", required: true, placeholder: "Enter TikTok video ID to monitor" }
    ]
  },

  // TikTok Actions
  {
    type: "tiktok_action_upload_video",
    title: "Upload Video (TikTok)",
    description: "Upload a new video to TikTok",
    icon: Upload,
    providerId: "tiktok",
    requiredScopes: ["video.upload"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoFile", label: "Video File", type: "file", required: true, accept: "video/*", maxSize: 100 * 1024 * 1024 },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Video description" },
      { name: "privacy", label: "Privacy", type: "select", required: false, defaultValue: "public", options: [
        { value: "public", label: "Public" },
        { value: "private", label: "Private" }
      ] }
    ]
  },
  {
    type: "tiktok_action_get_video_analytics",
    title: "Get Video Analytics (TikTok)",
    description: "Get analytics data for a TikTok video",
    icon: BarChart,
    providerId: "tiktok",
    requiredScopes: ["video.list"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "videoId", label: "Video ID", type: "text", required: true, placeholder: "Enter TikTok video ID" },
      { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "views", options: [
        { value: "views", label: "Views" },
        { value: "likes", label: "Likes" },
        { value: "comments", label: "Comments" },
        { value: "shares", label: "Shares" }
      ] }
    ]
  },

  // YouTube Studio Triggers
  {
    type: "youtube-studio_trigger_new_comment",
    title: "New Comment (YouTube Studio)",
    description: "Triggers when a new comment is posted on your YouTube video",
    icon: MessageSquare,
    providerId: "youtube-studio",
    category: "Social",
    isTrigger: true,
    configSchema: [
      { name: "videoId", label: "Video", type: "select", dynamic: "youtube_videos", required: true, placeholder: "Select a video to monitor" }
    ]
  },
  {
    type: "youtube-studio_trigger_channel_analytics",
    title: "Channel Analytics Update (YouTube Studio)",
    description: "Triggers when channel analytics reach certain thresholds",
    icon: BarChart,
    providerId: "youtube-studio",
    category: "Social",
    isTrigger: true,
    configSchema: [
      { name: "metric", label: "Metric", type: "select", required: true, defaultValue: "subscribers", options: [
        { value: "subscribers", label: "Subscribers" },
        { value: "views", label: "Views" },
        { value: "watch_time", label: "Watch Time" }
      ] },
      { name: "threshold", label: "Threshold", type: "number", required: true, placeholder: "Enter threshold value" }
    ]
  },

  // YouTube Studio Actions
  {
    type: "youtube-studio_action_moderate_comment",
    title: "Moderate Comment (YouTube Studio)",
    description: "Moderate a comment on your YouTube video",
    icon: Shield,
    providerId: "youtube-studio",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "commentId", label: "Comment ID", type: "text", required: true, placeholder: "Enter comment ID" },
      { name: "action", label: "Action", type: "select", required: true, defaultValue: "approve", options: [
        { value: "approve", label: "Approve" },
        { value: "reject", label: "Reject" },
        { value: "spam", label: "Mark as Spam" }
      ] }
    ]
  },
  {
    type: "youtube-studio_action_get_channel_analytics",
    title: "Get Channel Analytics (YouTube Studio)",
    description: "Get detailed analytics for your YouTube channel",
    icon: BarChart,
    providerId: "youtube-studio",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "startDate", label: "Start Date", type: "date", required: true },
      { name: "endDate", label: "End Date", type: "date", required: true },
      { name: "metrics", label: "Metrics", type: "select", required: true, defaultValue: "views", options: [
        { value: "views", label: "Views" },
        { value: "subscribers", label: "Subscribers" },
        { value: "watch_time", label: "Watch Time" },
        { value: "revenue", label: "Revenue" }
      ] }
    ]
  },

  // Blackbaud Triggers
  {
    type: "blackbaud_trigger_new_donor",
    title: "New Donor (Blackbaud)",
    description: "Triggers when a new donor is added to the system",
    icon: UserPlus,
    providerId: "blackbaud",
    category: "Other",
    isTrigger: true,
    configSchema: [
      { name: "constituentType", label: "Constituent Type", type: "select", required: false, options: [
        { value: "Individual", label: "Individual" },
        { value: "Organization", label: "Organization" }
      ] }
    ]
  },
  {
    type: "blackbaud_trigger_new_donation",
    title: "New Donation (Blackbaud)",
    description: "Triggers when a new donation is received",
    icon: DollarSign,
    providerId: "blackbaud",
    category: "Other",
    isTrigger: true,
    configSchema: [
      { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum donation amount" },
      { name: "fundId", label: "Fund ID", type: "text", required: false, placeholder: "Specific fund ID to monitor" }
    ]
  },

  // Blackbaud Actions
  {
    type: "blackbaud_action_create_constituent",
    title: "Create Constituent (Blackbaud)",
    description: "Create a new constituent in Blackbaud",
    icon: UserPlus,
    providerId: "blackbaud",
    requiredScopes: [],
    category: "Other",
    isTrigger: false,
    configSchema: [
      { name: "firstName", label: "First Name", type: "text", required: true, placeholder: "Enter first name" },
      { name: "lastName", label: "Last Name", type: "text", required: true, placeholder: "Enter last name" },
      { name: "email", label: "Email", type: "email", required: false, placeholder: "Enter email address" },
      { name: "phone", label: "Phone", type: "text", required: false, placeholder: "Enter phone number" },
      { name: "address", label: "Address", type: "textarea", required: false, placeholder: "Enter address" }
    ]
  },
  {
    type: "blackbaud_action_create_donation",
    title: "Create Donation (Blackbaud)",
    description: "Create a new donation record in Blackbaud",
    icon: DollarSign,
    providerId: "blackbaud",
    requiredScopes: [],
    category: "Other",
    isTrigger: false,
    configSchema: [
      { name: "constituentId", label: "Constituent ID", type: "text", required: true, placeholder: "Enter constituent ID" },
      { name: "amount", label: "Amount", type: "number", required: true, placeholder: "Enter donation amount" },
      { name: "fundId", label: "Fund ID", type: "text", required: false, placeholder: "Enter fund ID" },
      { name: "date", label: "Donation Date", type: "date", required: true },
      { name: "notes", label: "Notes", type: "textarea", required: false, placeholder: "Additional notes" }
    ]
  },

  // Gumroad Triggers
  {
    type: "gumroad_trigger_new_sale",
    title: "New Sale (Gumroad)",
    description: "Triggers when a new sale is made on Gumroad",
    icon: ShoppingCart,
    providerId: "gumroad",
    category: "E-commerce",
    isTrigger: true,
    configSchema: [
      { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" },
      { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum sale amount" }
    ]
  },
  {
    type: "gumroad_trigger_new_subscriber",
    title: "New Subscriber (Gumroad)",
    description: "Triggers when someone subscribes to your Gumroad product",
    icon: UserPlus,
    providerId: "gumroad",
    category: "E-commerce",
    isTrigger: true,
    configSchema: [
      { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" }
    ]
  },

  // Gumroad Actions
  {
    type: "gumroad_action_create_product",
    title: "Create Product (Gumroad)",
    description: "Create a new product on Gumroad",
    icon: Package,
    providerId: "gumroad",
    requiredScopes: ["edit_products"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Product Name", type: "text", required: true, placeholder: "Enter product name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Product description" },
      { name: "price", label: "Price (cents)", type: "number", required: true, placeholder: "Price in cents (e.g., 1000 for $10)" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
        { value: "USD", label: "USD" },
        { value: "EUR", label: "EUR" },
        { value: "GBP", label: "GBP" }
      ] },
      { name: "productType", label: "Product Type", type: "select", required: true, defaultValue: "standard", options: [
        { value: "standard", label: "Standard" },
        { value: "subscription", label: "Subscription" }
      ] }
    ]
  },
  {
    type: "gumroad_action_get_sales_analytics",
    title: "Get Sales Analytics (Gumroad)",
    description: "Get sales analytics data from Gumroad",
    icon: BarChart,
    providerId: "gumroad",
    requiredScopes: ["view_sales"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "startDate", label: "Start Date", type: "date", required: true },
      { name: "endDate", label: "End Date", type: "date", required: true },
      { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID (optional)" }
    ]
  },
]
