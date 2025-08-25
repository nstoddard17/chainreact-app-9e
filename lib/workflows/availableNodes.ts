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
  Globe,
  XCircle,
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
  type: "string" | "number" | "boolean" | "select" | "combobox" | "textarea" | "text" | "email" | "password" | "email-autocomplete" | "location-autocomplete" | "file" | "date" | "time" | "datetime" | "custom" | "rich-text" | "email-rich-text" | "discord-rich-text" | "multi-select"
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[] | string[]
  dynamic?: "slack-channels" | "slack_workspaces" | "slack_users" | "google-calendars" | "google-contacts" | "google-drive-folders" | "google-drive-files" | "onedrive-folders" | "dropbox-folders" | "box-folders" | "gmail-recent-recipients" | "gmail-enhanced-recipients" | "gmail-contact-groups" | "gmail_messages" | "gmail_labels" | "gmail_recent_senders" | "gmail_signatures" | "google-sheets_spreadsheets" | "google-sheets_sheets" | "google-docs_documents" | "google-docs_templates" | "google-docs_recent_documents" | "google-docs_shared_documents" | "google-docs_folders" | "youtube_channels" | "youtube_videos" | "youtube_playlists" | "teams_chats" | "teams_teams" | "teams_channels" | "github_repositories" | "gitlab_projects" | "notion_databases" | "notion_pages" | "notion_workspaces" | "notion_users" | "trello_boards" | "trello_lists" | "hubspot_companies" | "hubspot_contacts" | "hubspot_deals" | "hubspot_lists" | "hubspot_pipelines" | "hubspot_deal_stages" | "hubspot_job_titles" | "hubspot_departments" | "hubspot_industries" | "airtable_workspaces" | "airtable_bases" | "airtable_tables" | "airtable_records" | "airtable_feedback_records" | "airtable_task_records" | "airtable_project_records" | "gumroad_products" | "blackbaud_constituents" | "facebook_pages" | "facebook_conversations" | "facebook_posts" | "onenote_notebooks" | "onenote_sections" | "onenote_pages" | "outlook_folders" | "outlook_messages" | "outlook_contacts" | "outlook_calendars" | "outlook_events" | "outlook-enhanced-recipients" | "discord_guilds" | "discord_channels" | "discord_categories" | "discord_members" | "discord_roles" | "discord_messages" | "discord_users" | "discord_banned_users"
  accept?: string // For file inputs, specify accepted file types
  maxSize?: number // For file inputs, specify max file size in bytes
  defaultValue?: string | number | boolean // Default value for the field
  tableName?: string // For Airtable record fields, specify which table to fetch records from
  uiTab?: "basic" | "advanced" | "monetization" // For tabbed interfaces, specify which tab this field should appear in
  defaultOptions?: { value: string; label: string }[] // Default options for select fields
  [key: string]: any
}

export interface NodeField {
  name: string
  label: string
  type: "text" | "textarea" | "number" | "boolean" | "select" | "combobox" | "file" | "custom" | "email" | "time" | "datetime" | "email-autocomplete" | "date" | "location-autocomplete" | "rich-text" | "email-rich-text" | "discord-rich-text" | "multi-select"
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
  // Value constraints
  min?: number
  max?: number
  // UI organization properties
  uiTab?: "basic" | "advanced" | "monetization"
  defaultOptions?: { value: string; label: string }[]
  // New field for output data descriptions
  outputType?: "string" | "number" | "array" | "object" | "boolean"
  // Variable picker support
  hasVariablePicker?: boolean
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
      },
      {
        name: "template",
        label: "Template",
        type: "select",
        defaultValue: "none",
        options: [
          { value: "none", label: "No template (use default behavior)" },
          { value: "summarize", label: "Summarize Content" },
          { value: "extract", label: "Extract Information" },
          { value: "sentiment", label: "Sentiment Analysis" },
          { value: "translate", label: "Translate Text" },
          { value: "generate", label: "Generate Content" },
          { value: "classify", label: "Classify Content" },
          { value: "email_response", label: "Email Response" },
          { value: "data_analysis", label: "Data Analysis" },
          { value: "content_creation", label: "Content Creation" },
          { value: "customer_support", label: "Customer Support" },
          { value: "custom", label: "Custom Template" }
        ],
        description: "Choose a predefined template or create a custom one"
      },
      {
        name: "customTemplate",
        label: "Prompt",
        type: "textarea",
        dependsOn: "template",
        placeholder: "Write your custom prompt here...",
        description: "Define a custom prompt for the AI agent to follow"
      },
      {
        name: "contentType",
        label: "Content Type (for Generate template)",
        type: "select",
        dependsOn: "template",
        defaultValue: "email",
        options: [
          { value: "email", label: "Email" },
          { value: "report", label: "Report" },
          { value: "summary", label: "Summary" },
          { value: "response", label: "Response" },
          { value: "custom", label: "Custom" }
        ],
        description: "Type of content to generate (only used with Generate template)"
      },
      {
        name: "tone",
        label: "Tone",
        type: "select",
        dependsOn: "template",
        defaultValue: "professional",
        options: [
          { value: "professional", label: "Professional" },
          { value: "casual", label: "Casual" },
          { value: "friendly", label: "Friendly" },
          { value: "formal", label: "Formal" }
        ],
        description: "Tone to use for content generation"
      },
      {
        name: "length",
        label: "Length",
        type: "select",
        dependsOn: "template",
        defaultValue: "medium",
        options: [
          { value: "short", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "long", label: "Long" }
        ],
        description: "Length of generated content"
      }
    ],
    outputSchema: [
      {
        name: "output",
        label: "AI Agent Output",
        type: "string",
        description: "The complete, unprocessed AI response"
      },
      {
        name: "email_subject",
        label: "Email Subject",
        type: "string",
        description: "Generated email subject line"
      },
      {
        name: "email_body",
        label: "Email Body",
        type: "string",
        description: "Generated email body content"
      },
      {
        name: "slack_message",
        label: "Slack Message",
        type: "string",
        description: "Generated message for Slack actions"
      },
      {
        name: "discord_message",
        label: "Discord Message",
        type: "string",
        description: "Generated message for Discord actions"
      },
      {
        name: "notion_title",
        label: "Notion Page Title",
        type: "string",
        description: "Generated title for Notion page creation"
      },
      {
        name: "notion_content",
        label: "Notion Page Content",
        type: "string",
        description: "Generated content for Notion page creation"
      }
    ],
    producesOutput: true
  },
  {
    type: "smart_ai_agent",
    title: "Smart AI Agent",
    description: "Automatically analyzes downstream actions and fills all fields intelligently based on context",
    icon: Zap,
    category: "AI & Automation",
    providerId: "ai",
    isTrigger: false,
    testable: true,
    configSchema: [
      {
        name: "targetAction",
        label: "Target Action to Fill",
        type: "select",
        required: true,
        dynamic: true,
        placeholder: "Select which action should be automatically filled...",
        description: "The Smart AI Agent will analyze this action's schema and fill all compatible fields"
      },
      {
        name: "tone",
        label: "Tone & Style",
        type: "select",
        defaultValue: "professional",
        options: [
          { value: "professional", label: "Professional" },
          { value: "casual", label: "Casual" },
          { value: "friendly", label: "Friendly" },
          { value: "formal", label: "Formal" },
          { value: "conversational", label: "Conversational" }
        ],
        description: "How should the AI generate content?"
      },
      {
        name: "length",
        label: "Content Length",
        type: "select",
        defaultValue: "concise",
        options: [
          { value: "concise", label: "Concise & Brief" },
          { value: "detailed", label: "Detailed" },
          { value: "comprehensive", label: "Comprehensive" }
        ],
        description: "How much detail should be included in generated content?"
      },
      {
        name: "includeEmojis",
        label: "Include Emojis",
        type: "boolean",
        defaultValue: false,
        description: "Add relevant emojis to make content more engaging (for casual platforms)"
      },
      {
        name: "customInstructions",
        label: "Custom Instructions",
        type: "textarea",
        placeholder: "Any specific instructions for content generation...",
        description: "Additional context or requirements for the AI agent"
      }
    ],
    outputSchema: [
      {
        name: "generatedFields",
        label: "Generated Fields",
        type: "object",
        description: "All fields that were automatically generated for the target action"
      },
      {
        name: "fieldsCount",
        label: "Fields Generated Count",
        type: "number",
        description: "Number of fields that were successfully generated"
      },
      {
        name: "targetActionType",
        label: "Target Action Type",
        type: "string",
        description: "The type of action that was analyzed and filled"
      },
      {
        name: "analysisContext",
        label: "Analysis Context",
        type: "object",
        description: "Context data that was used for generation"
      }
    ],
    producesOutput: true
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
      { name: "subject", label: "Subject", type: "text", placeholder: "Email subject", required: true },
      { name: "body", label: "Body", type: "email-rich-text", required: true, placeholder: "Compose your email message...", provider: "gmail" },
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

  // Google Calendar
  {
    type: "google_calendar_trigger_new_event",
    title: "New Event",
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
    title: "Create Event",
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
        type: "text", 
        dynamic: "gmail-recent-recipients",
        placeholder: "Type email addresses separated by commas"
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
        description: "Automatically generate and add a Google Meet video conference link to this event. The Meet link will be created when the event is added to the calendar."
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
    title: "New File in Folder",
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
    title: "Upload File from URL",
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
    title: "New Row",
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
        name: "action",
        label: "Action",
        type: "select",
        required: true,
        showIf: (values: any) => values.sheetName,
        options: [
          { value: "add", label: "Add new row" },
          { value: "update", label: "Update existing row" },
          { value: "delete", label: "Delete row" }
        ]
      },

      // === ADD ROW FIELDS ===
      {
        name: "rowPosition",
        label: "Row Position",
        type: "select",
        required: true,
        showIf: (values: any) => values.action === "add",
        options: [
          { value: "end", label: "Add at end of sheet" },
          { value: "specific", label: "Insert at specific row" }
        ],
        description: "Choose where to add the new row",
        helpText: "Add at end will append the row to the bottom of your data. Insert at specific row will add it at the row number you specify."
      },
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        showIf: (values: any) => values.action === "add" && values.rowPosition === "specific",
        placeholder: "Enter row number (e.g. 5)",
        min: 1,
        description: "The row number where the new data will be inserted",
        helpText: "Row 1 is typically headers. Row 2 is the first data row. Existing rows will be shifted down."
      },
      {
        name: "columnMapping",
        label: "What Data to Add",
        type: "google_sheets_column_mapper",
        required: true,
        showIf: (values: any) => values.action === "add",
        dependsOn: "sheetName",
        description: "Choose which data goes into which columns",
        helpText: "Select a column from your spreadsheet, then choose what data from your workflow should go there. For example, put the 'Email' from your trigger into the 'Email Address' column."
      },

      // === UPDATE ROW FIELDS ===
      {
        name: "findRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        showIf: (values: any) => values.action === "update",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value" },
          { value: "conditions", label: "Multiple conditions" }
        ],
        description: "How to identify which row to update",
        helpText: "Row number: Update a specific row (e.g. row 5). Column value: Find row where a column contains a specific value. Multiple conditions: Use complex rules to find the right row."
      },
      {
        name: "updateRowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The specific row number to update",
        helpText: "Row 1 is typically headers. Row 2 is the first data row. Enter the row number you want to update."
      },
      {
        name: "searchColumn",
        label: "Search Column",
        type: "select",
        dynamic: "google-sheets_columns",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "column_value",
        dependsOn: "sheetName",
        description: "Which column to search in",
        helpText: "Choose the column that contains the value you want to search for. For example, if you want to find a row with a specific email, choose the Email column."
      },
      {
        name: "searchValue",
        label: "Search Value",
        type: "text",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "column_value",
        placeholder: "Value to search for",
        description: "The value to look for in the search column",
        helpText: "Enter the exact value you want to find. For example, 'john@example.com' if searching in an email column."
      },
      {
        name: "conditions",
        label: "Conditions",
        type: "google_sheets_condition_builder",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "conditions",
        dependsOn: "sheetName",
        description: "Set up rules to find the right row",
        helpText: "Create multiple conditions to find rows. For example, 'Status equals Active AND Date is after 2024-01-01'."
      },
      {
        name: "updateMapping",
        label: "What Data to Update",
        type: "google_sheets_column_mapper",
        required: true,
        showIf: (values: any) => values.action === "update",
        dependsOn: "sheetName",
        description: "Choose which columns to update with new data",
        helpText: "Select the columns you want to change and what new data should go in them. Only these columns will be updated - everything else stays the same."
      },

      // === DELETE ROW FIELDS ===
      {
        name: "deleteRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        showIf: (values: any) => values.action === "delete",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value" },
          { value: "conditions", label: "Multiple conditions" }
        ],
        description: "How to identify which row to delete",
        helpText: "Row number: Delete a specific row (e.g. row 5). Column value: Find and delete row where a column contains a specific value. Multiple conditions: Use complex rules to find the right row."
      },
      {
        name: "deleteRowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The specific row number to delete",
        helpText: "Row 1 is typically headers. Row 2 is the first data row. Be careful - this will permanently delete the row!"
      },
      {
        name: "deleteSearchColumn",
        label: "Search Column",
        type: "select",
        dynamic: "google-sheets_columns",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "column_value",
        dependsOn: "sheetName",
        description: "Which column to search in",
        helpText: "Choose the column that contains the value you want to search for. For example, if you want to delete a row with a specific email, choose the Email column."
      },
      {
        name: "deleteSearchValue",
        label: "Search Value",
        type: "text",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "column_value",
        placeholder: "Value to search for",
        description: "The value to look for in the search column",
        helpText: "Enter the exact value you want to find. For example, 'john@example.com' if searching in an email column. The row containing this value will be deleted."
      },
      {
        name: "deleteConditions",
        label: "Conditions",
        type: "google_sheets_condition_builder",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "conditions",
        dependsOn: "sheetName",
        description: "Set up rules to find the right row",
        helpText: "Create multiple conditions to find rows to delete. For example, 'Status equals Inactive AND Last Login is before 2024-01-01'. Be careful - matching rows will be permanently deleted!"
      },

      // === DATA PREVIEW ===
      {
        name: "dataPreview",
        label: "Sheet Preview",
        type: "google_sheets_data_preview",
        required: false,
        showIf: (values: any) => values.sheetName,
        dependsOn: "sheetName",
        description: "Preview of your spreadsheet data",
        helpText: "This shows you the first few rows of your sheet to help you understand the column structure and data types."
      }
    ],
  },
  {
    type: "google-sheets_action_create_row",
    title: "Create Row",
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

  // Slack Triggers
  {
    type: "slack_trigger_message_channels",
    title: "New Message in Public Channel",
    description: "Triggers when a message is posted to a public channel",
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
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all public channels."
      },
    ],
    outputSchema: [
      {
        name: "messageText",
        label: "Message Text",
        type: "string",
        description: "The content of the message"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who sent the message"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who sent the message"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the message was posted"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the message was posted"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the message was posted"
      },
      {
        name: "threadTs",
        label: "Thread Timestamp",
        type: "string",
        description: "The timestamp of the parent message if this is in a thread"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_message_groups",
    title: "New Message in Private Channel",
    description: "Triggers when a message is posted to a private channel",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Private Channel",
        type: "select",
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific private channel. Leave empty to listen to all private channels."
      },
    ],
    outputSchema: [
      {
        name: "messageText",
        label: "Message Text",
        type: "string",
        description: "The content of the message"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who sent the message"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who sent the message"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the private channel where the message was posted"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the private channel where the message was posted"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the message was posted"
      },
      {
        name: "threadTs",
        label: "Thread Timestamp",
        type: "string",
        description: "The timestamp of the parent message if this is in a thread"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_message_im",
    title: "New Direct Message",
    description: "Triggers when a direct message is sent",
    icon: MessageCircle,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "messageText",
        label: "Message Text",
        type: "string",
        description: "The content of the direct message"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who sent the message"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who sent the message"
      },
      {
        name: "channelId",
        label: "DM Channel ID",
        type: "string",
        description: "The ID of the direct message channel"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the message was sent"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_message_mpim",
    title: "New Group Direct Message",
    description: "Triggers when a message is sent in a group direct message",
    icon: MessageCircle,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "messageText",
        label: "Message Text",
        type: "string",
        description: "The content of the group direct message"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who sent the message"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who sent the message"
      },
      {
        name: "channelId",
        label: "Group DM Channel ID",
        type: "string",
        description: "The ID of the group direct message channel"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the message was sent"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_reaction_added",
    title: "Reaction Added",
    description: "Triggers when a reaction is added to a message",
    icon: Heart,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
      { 
        name: "emoji", 
        label: "Emoji", 
        type: "text", 
        required: false,
        placeholder: "e.g., thumbsup (without colons)",
        description: "Optional: Filter to a specific emoji. Leave empty to listen to all reactions."
      },
    ],
    outputSchema: [
      {
        name: "reaction",
        label: "Reaction Emoji",
        type: "string",
        description: "The emoji that was added (without colons)"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who added the reaction"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who added the reaction"
      },
      {
        name: "messageUserId",
        label: "Message Author ID",
        type: "string",
        description: "The ID of the user who wrote the original message"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the reaction was added"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the reaction was added"
      },
      {
        name: "messageTimestamp",
        label: "Message Timestamp",
        type: "string",
        description: "The timestamp of the message that was reacted to"
      },
      {
        name: "eventTimestamp",
        label: "Reaction Timestamp",
        type: "string",
        description: "When the reaction was added"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_reaction_removed",
    title: "Reaction Removed",
    description: "Triggers when a reaction is removed from a message",
    icon: HeartOff,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
      { 
        name: "emoji", 
        label: "Emoji", 
        type: "text", 
        required: false,
        placeholder: "e.g., thumbsup (without colons)",
        description: "Optional: Filter to a specific emoji. Leave empty to listen to all reactions."
      },
    ],
    outputSchema: [
      {
        name: "reaction",
        label: "Reaction Emoji",
        type: "string",
        description: "The emoji that was removed (without colons)"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who removed the reaction"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who removed the reaction"
      },
      {
        name: "messageUserId",
        label: "Message Author ID",
        type: "string",
        description: "The ID of the user who wrote the original message"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the reaction was removed"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the reaction was removed"
      },
      {
        name: "messageTimestamp",
        label: "Message Timestamp",
        type: "string",
        description: "The timestamp of the message that the reaction was removed from"
      },
      {
        name: "eventTimestamp",
        label: "Reaction Timestamp",
        type: "string",
        description: "When the reaction was removed"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_channel_created",
    title: "Channel Created",
    description: "Triggers when a new channel is created",
    icon: Hash,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the newly created channel"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the newly created channel"
      },
      {
        name: "creatorId",
        label: "Creator ID",
        type: "string",
        description: "The ID of the user who created the channel"
      },
      {
        name: "creatorName",
        label: "Creator Name",
        type: "string",
        description: "The display name of the user who created the channel"
      },
      {
        name: "created",
        label: "Creation Timestamp",
        type: "string",
        description: "When the channel was created"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_member_joined_channel",
    title: "Member Joined Channel",
    description: "Triggers when a user joins a channel",
    icon: UserPlus,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
    ],
    outputSchema: [
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who joined the channel"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who joined the channel"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel that was joined"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel that was joined"
      },
      {
        name: "channelType",
        label: "Channel Type",
        type: "string",
        description: "The type of channel (C for public/private, G for old private channels)"
      },
      {
        name: "inviterId",
        label: "Inviter ID",
        type: "string",
        description: "The ID of the user who invited them (if applicable)"
      },
      {
        name: "inviterName",
        label: "Inviter Name",
        type: "string",
        description: "The display name of the user who invited them (if applicable)"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_trigger_member_left_channel",
    title: "Member Left Channel",
    description: "Triggers when a user leaves a channel",
    icon: UserMinus,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "channel",
        label: "Channel",
        type: "select",
        required: false,
        dynamic: "slack-channels",
        description: "Optional: Filter to a specific channel. Leave empty to listen to all channels."
      },
    ],
    outputSchema: [
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who left the channel"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who left the channel"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel that was left"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel that was left"
      },
      {
        name: "channelType",
        label: "Channel Type",
        type: "string",
        description: "The type of channel (C for public/private, G for old private channels)"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      }
    ],
  },
  {
    type: "slack_action_send_message",
    title: "Send Message",
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
    title: "Create Channel",
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
            title: "New Page in Database",
    description: "Triggers when a page is added to a database",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: false },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: false, dependsOn: "workspace" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string" },
      { name: "databaseId", label: "Database ID", type: "string" },
      { name: "title", label: "Title", type: "string" },
      { name: "url", label: "URL", type: "string" },
      { name: "createdAt", label: "Created At", type: "string" }
    ]
  },
  {
    type: "notion_trigger_page_updated",
    title: "Page Updated",
    description: "Triggers when a page's properties or content are updated",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: false },
      { name: "database", label: "Database", type: "select", dynamic: "notion_databases", required: false, dependsOn: "workspace" }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string" },
      { name: "databaseId", label: "Database ID", type: "string" },
      { name: "title", label: "Title", type: "string" },
      { name: "changedProperties", label: "Changed Properties", type: "object" },
      { name: "updatedAt", label: "Updated At", type: "string" },
      { name: "url", label: "URL", type: "string" }
    ]
  },
  {
    type: "notion_trigger_comment_added",
    title: "Comment Added",
    description: "Triggers when a new comment is added to a page",
    icon: MessageSquare,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "workspace", label: "Workspace", type: "select", dynamic: "notion_workspaces", required: false }
    ],
    outputSchema: [
      { name: "pageId", label: "Page ID", type: "string" },
      { name: "commentId", label: "Comment ID", type: "string" },
      { name: "commentText", label: "Comment Text", type: "string" },
      { name: "authorId", label: "Author ID", type: "string" },
      { name: "authorName", label: "Author Name", type: "string" },
      { name: "createdAt", label: "Created At", type: "string" }
    ]
  },
  {
    type: "notion_action_create_page",
            title: "Create Page",
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
        placeholder: "Select Notion workspace",
        description: "Select the workspace where you want to create the page."
      },
      { 
        name: "database", 
        label: "Database (Optional)", 
        type: "select", 
        dynamic: "notion_databases",
        required: false,
        placeholder: "Select database (leave empty for root level)",
        description: "Choose a database to create the page in. Leave empty to create at the root level.",
        dependsOn: "workspace"
      },
      { 
        name: "databaseProperties", 
        label: "Database Properties (Optional)", 
        type: "select", 
        dynamic: "notion_database_properties",
        required: false,
        placeholder: "Select database properties to set",
        description: "Choose properties from the selected database to set values for the new page.",
        dependsOn: "database"
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
            title: "Append to Page",
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
    comingSoon: true,
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
    comingSoon: true,
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
    title: "New Payment",
    description: "Triggers on a new successful payment",
    icon: ShoppingCart,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
  },
  {
    type: "stripe_action_create_customer",
    title: "Create Customer",
    description: "Create a new customer",
    icon: Users,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
  },

  // HubSpot Triggers
  {
    type: "hubspot_trigger_contact_created",
    title: "Contact Created",
    description: "Triggers when a new contact is created in HubSpot",
    icon: UserPlus,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
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
        name: "firstName",
        label: "First Name",
        type: "string",
        description: "The contact's first name"
      },
      {
        name: "lastName",
        label: "Last Name",
        type: "string",
        description: "The contact's last name"
      },
      {
        name: "company",
        label: "Company",
        type: "string",
        description: "The contact's company name"
      },
      {
        name: "phone",
        label: "Phone",
        type: "string",
        description: "The contact's phone number"
      },
      {
        name: "hubspotOwner",
        label: "HubSpot Owner",
        type: "string",
        description: "The contact's assigned owner in HubSpot"
      },
      {
        name: "leadStatus",
        label: "Lead Status",
        type: "string",
        description: "The contact's current lead status"
      },
      {
        name: "createDate",
        label: "Create Date",
        type: "string",
        description: "When the contact was created"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_contact_updated",
    title: "Contact Property Updated",
    description: "Triggers when a contact property is updated in HubSpot",
    icon: User,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: false,
        placeholder: "e.g., email, phone, hs_lead_status",
        description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
      },
    ],
    outputSchema: [
      {
        name: "contactId",
        label: "Contact ID",
        type: "string",
        description: "The unique ID of the updated contact"
      },
      {
        name: "propertyName",
        label: "Property Name",
        type: "string",
        description: "The name of the property that was updated"
      },
      {
        name: "propertyValue",
        label: "New Property Value",
        type: "string",
        description: "The new value of the updated property"
      },
      {
        name: "previousValue",
        label: "Previous Value",
        type: "string",
        description: "The previous value of the property"
      },
      {
        name: "email",
        label: "Email",
        type: "string",
        description: "The contact's email address"
      },
      {
        name: "firstName",
        label: "First Name",
        type: "string",
        description: "The contact's first name"
      },
      {
        name: "lastName",
        label: "Last Name",
        type: "string",
        description: "The contact's last name"
      },
      {
        name: "changeSource",
        label: "Change Source",
        type: "string",
        description: "What triggered the property change (e.g., CRM_UI, API, WORKFLOW)"
      },
      {
        name: "timestamp",
        label: "Update Timestamp",
        type: "string",
        description: "When the property was updated"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_contact_deleted",
    title: "Contact Deleted",
    description: "Triggers when a contact is deleted from HubSpot",
    icon: UserMinus,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "contactId",
        label: "Contact ID",
        type: "string",
        description: "The unique ID of the deleted contact"
      },
      {
        name: "email",
        label: "Email",
        type: "string",
        description: "The contact's email address (if available)"
      },
      {
        name: "firstName",
        label: "First Name",
        type: "string",
        description: "The contact's first name (if available)"
      },
      {
        name: "lastName",
        label: "Last Name",
        type: "string",
        description: "The contact's last name (if available)"
      },
      {
        name: "deleteTimestamp",
        label: "Delete Timestamp",
        type: "string",
        description: "When the contact was deleted"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_company_created",
    title: "Company Created",
    description: "Triggers when a new company is created in HubSpot",
    icon: Building,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "companyId",
        label: "Company ID",
        type: "string",
        description: "The unique ID of the created company"
      },
      {
        name: "name",
        label: "Company Name",
        type: "string",
        description: "The company's name"
      },
      {
        name: "domain",
        label: "Website Domain",
        type: "string",
        description: "The company's website domain"
      },
      {
        name: "industry",
        label: "Industry",
        type: "string",
        description: "The company's industry"
      },
      {
        name: "city",
        label: "City",
        type: "string",
        description: "The company's city"
      },
      {
        name: "state",
        label: "State",
        type: "string",
        description: "The company's state/region"
      },
      {
        name: "country",
        label: "Country",
        type: "string",
        description: "The company's country"
      },
      {
        name: "phone",
        label: "Phone",
        type: "string",
        description: "The company's phone number"
      },
      {
        name: "hubspotOwner",
        label: "HubSpot Owner",
        type: "string",
        description: "The company's assigned owner in HubSpot"
      },
      {
        name: "createDate",
        label: "Create Date",
        type: "string",
        description: "When the company was created"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_company_updated",
    title: "Company Property Updated",
    description: "Triggers when a company property is updated in HubSpot",
    icon: Building,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: false,
        placeholder: "e.g., name, domain, industry",
        description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
      },
    ],
    outputSchema: [
      {
        name: "companyId",
        label: "Company ID",
        type: "string",
        description: "The unique ID of the updated company"
      },
      {
        name: "propertyName",
        label: "Property Name",
        type: "string",
        description: "The name of the property that was updated"
      },
      {
        name: "propertyValue",
        label: "New Property Value",
        type: "string",
        description: "The new value of the updated property"
      },
      {
        name: "previousValue",
        label: "Previous Value",
        type: "string",
        description: "The previous value of the property"
      },
      {
        name: "name",
        label: "Company Name",
        type: "string",
        description: "The company's name"
      },
      {
        name: "domain",
        label: "Website Domain",
        type: "string",
        description: "The company's website domain"
      },
      {
        name: "changeSource",
        label: "Change Source",
        type: "string",
        description: "What triggered the property change (e.g., CRM_UI, API, WORKFLOW)"
      },
      {
        name: "timestamp",
        label: "Update Timestamp",
        type: "string",
        description: "When the property was updated"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_company_deleted",
    title: "Company Deleted",
    description: "Triggers when a company is deleted from HubSpot",
    icon: Building,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "companyId",
        label: "Company ID",
        type: "string",
        description: "The unique ID of the deleted company"
      },
      {
        name: "name",
        label: "Company Name",
        type: "string",
        description: "The company's name (if available)"
      },
      {
        name: "domain",
        label: "Website Domain",
        type: "string",
        description: "The company's website domain (if available)"
      },
      {
        name: "deleteTimestamp",
        label: "Delete Timestamp",
        type: "string",
        description: "When the company was deleted"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_deal_created",
    title: "Deal Created",
    description: "Triggers when a new deal is created in HubSpot",
    icon: DollarSign,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "dealId",
        label: "Deal ID",
        type: "string",
        description: "The unique ID of the created deal"
      },
      {
        name: "dealName",
        label: "Deal Name",
        type: "string",
        description: "The name/title of the deal"
      },
      {
        name: "amount",
        label: "Deal Amount",
        type: "string",
        description: "The monetary value of the deal"
      },
      {
        name: "dealStage",
        label: "Deal Stage",
        type: "string",
        description: "The current stage of the deal"
      },
      {
        name: "pipeline",
        label: "Pipeline",
        type: "string",
        description: "The sales pipeline the deal belongs to"
      },
      {
        name: "closeDate",
        label: "Close Date",
        type: "string",
        description: "The expected close date of the deal"
      },
      {
        name: "dealType",
        label: "Deal Type",
        type: "string",
        description: "The type of deal (e.g., New Business, Existing Business)"
      },
      {
        name: "hubspotOwner",
        label: "HubSpot Owner",
        type: "string",
        description: "The deal's assigned owner in HubSpot"
      },
      {
        name: "priority",
        label: "Priority",
        type: "string",
        description: "The priority level of the deal"
      },
      {
        name: "createDate",
        label: "Create Date",
        type: "string",
        description: "When the deal was created"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_deal_updated",
    title: "Deal Property Updated",
    description: "Triggers when a deal property is updated in HubSpot",
    icon: DollarSign,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "propertyName",
        label: "Property Name",
        type: "text",
        required: false,
        placeholder: "e.g., dealstage, amount, closedate",
        description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
      },
    ],
    outputSchema: [
      {
        name: "dealId",
        label: "Deal ID",
        type: "string",
        description: "The unique ID of the updated deal"
      },
      {
        name: "propertyName",
        label: "Property Name",
        type: "string",
        description: "The name of the property that was updated"
      },
      {
        name: "propertyValue",
        label: "New Property Value",
        type: "string",
        description: "The new value of the updated property"
      },
      {
        name: "previousValue",
        label: "Previous Value",
        type: "string",
        description: "The previous value of the property"
      },
      {
        name: "dealName",
        label: "Deal Name",
        type: "string",
        description: "The name/title of the deal"
      },
      {
        name: "amount",
        label: "Deal Amount",
        type: "string",
        description: "The monetary value of the deal"
      },
      {
        name: "dealStage",
        label: "Deal Stage",
        type: "string",
        description: "The current stage of the deal"
      },
      {
        name: "changeSource",
        label: "Change Source",
        type: "string",
        description: "What triggered the property change (e.g., CRM_UI, API, WORKFLOW)"
      },
      {
        name: "timestamp",
        label: "Update Timestamp",
        type: "string",
        description: "When the property was updated"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_trigger_deal_deleted",
    title: "Deal Deleted",
    description: "Triggers when a deal is deleted from HubSpot",
    icon: DollarSign,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      {
        name: "dealId",
        label: "Deal ID",
        type: "string",
        description: "The unique ID of the deleted deal"
      },
      {
        name: "dealName",
        label: "Deal Name",
        type: "string",
        description: "The name/title of the deal (if available)"
      },
      {
        name: "amount",
        label: "Deal Amount",
        type: "string",
        description: "The monetary value of the deal (if available)"
      },
      {
        name: "dealStage",
        label: "Deal Stage",
        type: "string",
        description: "The stage the deal was in when deleted (if available)"
      },
      {
        name: "deleteTimestamp",
        label: "Delete Timestamp",
        type: "string",
        description: "When the deal was deleted"
      },
      {
        name: "portalId",
        label: "Portal ID",
        type: "string",
        description: "The HubSpot portal ID"
      }
    ],
  },
  {
    type: "hubspot_action_create_contact",
    title: "Create Contact",
    description: "Create a new contact in HubSpot CRM",
    icon: Plus,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.contacts.write"],
    category: "CRM",
    isTrigger: false,
    configSchema: [
      // Basic Information
      { name: "name", label: "Name", type: "text", required: true, placeholder: "John Doe" },
      { name: "email", label: "Email Address", type: "email", required: true, placeholder: "john.doe@example.com" },
      { name: "phone", label: "Phone Number", type: "text", required: true, placeholder: "+1-555-123-4567" },
      
      // Lead Management
      { 
        name: "hs_lead_status", 
        label: "Lead Status", 
        type: "select",
        options: [
          { value: "NEW", label: "New" },
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "In Progress" },
          { value: "OPEN_DEAL", label: "Open deal" },
          { value: "UNQUALIFIED", label: "Unqualified" },
          { value: "ATTEMPTED_TO_CONTACT", label: "Attempted to contact" },
          { value: "CONNECTED", label: "Connected" },
          { value: "BAD_TIMING", label: "Bad Timing" }
        ],
        required: true,
        placeholder: "Select lead status"
      },
      
      // Content Preferences
      { 
        name: "favorite_content_topics", 
        label: "Favorite Content Topics", 
        type: "select",
        options: [
          { value: "Strategy", label: "Strategy" },
          { value: "Operational", label: "Operational" },
          { value: "Financial", label: "Financial" },
          { value: "IT", label: "IT" },
          { value: "HR", label: "HR" }
        ],
        required: true,
        placeholder: "Select favorite content topics"
      },
      
      // Communication Preferences
      { 
        name: "preferred_channels", 
        label: "Preferred Channels", 
        type: "select",
        options: [
          { value: "Email", label: "Email" },
          { value: "SMS", label: "SMS" },
          { value: "Blog", label: "Blog" },
          { value: "Instagram", label: "Instagram" },
          { value: "Linkedin", label: "Linkedin" },
          { value: "Podcasts", label: "Podcasts" }
        ],
        required: true,
        placeholder: "Select preferred channels"
      },
      
      // Dynamic All Fields Selector
      { 
        name: "all_available_fields", 
        label: "All Available Fields", 
        type: "custom", 
        description: "Select from all available HubSpot contact properties. Fields with existing data will show dropdown options with current values.",
        dynamic: "hubspot_all_contact_properties"
      }
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
        name: "name",
        label: "Name",
        type: "string",
        description: "The contact's full name"
      },
      {
        name: "phone",
        label: "Phone",
        type: "string",
        description: "The contact's phone number"
      },
      {
        name: "hs_lead_status",
        label: "Lead Status",
        type: "string",
        description: "The contact's lead status"
      },
      {
        name: "favorite_content_topics",
        label: "Favorite Content Topics",
        type: "string",
        description: "The contact's favorite content topics"
      },
      {
        name: "preferred_channels",
        label: "Preferred Channels",
        type: "string",
        description: "The contact's preferred communication channels"
      },
      {
        name: "createdAt",
        label: "Created At",
        type: "string",
        description: "When the contact was created"
      },
      {
        name: "updatedAt",
        label: "Updated At",
        type: "string",
        description: "When the contact was last updated"
      },
      {
        name: "hubspotResponse",
        label: "Full HubSpot Response",
        type: "object",
        description: "Complete response from HubSpot API"
      }
    ]
  },

  // Airtable
  {
    type: "airtable_trigger_new_record",
    title: "New Record",
    description: "Triggers when a new record is created in a base",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string" },
      { name: "tableId", label: "Table ID", type: "string" },
      { name: "tableName", label: "Table Name", type: "string" },
      { name: "recordId", label: "Record ID", type: "string" },
      { name: "fields", label: "Fields", type: "object" },
      { name: "createdAt", label: "Created At", type: "string" }
    ]
  },
  {
    type: "airtable_trigger_record_updated",
    title: "Record Updated",
    description: "Triggers when an existing record is updated",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string" },
      { name: "tableId", label: "Table ID", type: "string" },
      { name: "tableName", label: "Table Name", type: "string" },
      { name: "recordId", label: "Record ID", type: "string" },
      { name: "changedFields", label: "Changed Fields", type: "object" },
      { name: "previousValues", label: "Previous Values", type: "object" },
      { name: "updatedAt", label: "Updated At", type: "string" }
    ]
  },
  {
    type: "airtable_trigger_record_deleted",
    title: "Record Deleted",
    description: "Triggers when a record is deleted",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string" },
      { name: "tableId", label: "Table ID", type: "string" },
      { name: "tableName", label: "Table Name", type: "string" },
      { name: "recordId", label: "Record ID", type: "string" },
      { name: "deletedAt", label: "Deleted At", type: "string" }
    ]
  },
  {
    type: "airtable_action_create_record",
    title: "Create Record",
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
    configSchema: [
      {
        name: "guildId",
        label: "Discord Server",
        type: "select",
        description: "The Discord server to monitor",
        placeholder: "Select a Discord server",
        dynamic: "discord_guilds",
        required: true
      },
      {
        name: "channelId",
        label: "Channel",
        type: "select",
        description: "The channel to monitor for new messages",
        placeholder: "Select a channel",
        dynamic: "discord_channels",
        dependsOn: "guildId",
        required: true,
        hidden: true
      },
      {
        name: "contentFilter",
        label: "Content Filter",
        type: "text",
        description: "Only trigger on messages containing this text (optional)",
        placeholder: "e.g., !command or keyword",
        hidden: true
      },
      {
        name: "authorFilter",
        label: "Author Filter",
        type: "select",
        description: "Only trigger on messages from this user (optional)",
        placeholder: "Any user",
        dynamic: "discord_users",
        dependsOn: "guildId",
        hidden: true
      }
    ],
    outputSchema: [
      {
        name: "messageId",
        label: "Message ID",
        type: "string",
        description: "The unique ID of the message"
      },
      {
        name: "content",
        label: "Message Content",
        type: "string",
        description: "The content of the message"
      },
      {
        name: "authorId",
        label: "Author ID",
        type: "string",
        description: "The ID of the message author"
      },
      {
        name: "authorName",
        label: "Author Name",
        type: "string",
        description: "The username of the message author"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the message was posted"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the message was posted"
      },
      {
        name: "guildId",
        label: "Server ID",
        type: "string",
        description: "The ID of the Discord server"
      },
      {
        name: "guildName",
        label: "Server Name",
        type: "string",
        description: "The name of the Discord server"
      },
      {
        name: "timestamp",
        label: "Message Time",
        type: "string",
        description: "When the message was posted (ISO 8601 format)"
      },
      {
        name: "attachments",
        label: "Attachments",
        type: "array",
        description: "Array of file attachments in the message"
      },
      {
        name: "mentions",
        label: "Mentions",
        type: "array",
        description: "Array of user mentions in the message"
      }
    ]
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
        type: "discord-rich-text",
        provider: "discord",
        required: true,
        placeholder: "Enter your Discord message with formatting, mentions, and emojis"
      }
    ]
  },


  // Microsoft Teams
  {
    type: "teams_trigger_new_message",
          title: "New Message in Channel",
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
          title: "Send Channel Message",
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
          title: "Create Meeting",
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
          title: "Send Chat Message",
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
          title: "Create Channel",
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
          title: "Add Member to Team",
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
          title: "Schedule Meeting",
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
          title: "Send Adaptive Card",
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
          title: "Get Team Members",
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
          title: "Create Team",
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
    title: "Upload File",
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
    title: "Upload File from URL",
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
    configSchema: [
      { name: "boardId", label: "Board", type: "select", dynamic: "trello-boards", required: false },
      { name: "listId", label: "List", type: "select", dynamic: "trello_lists", dependsOn: "boardId", required: false }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string" },
      { name: "listId", label: "List ID", type: "string" },
      { name: "cardId", label: "Card ID", type: "string" },
      { name: "name", label: "Name", type: "string" },
      { name: "desc", label: "Description", type: "string" },
      { name: "url", label: "URL", type: "string" },
      { name: "createdAt", label: "Created At", type: "string" }
    ]
  },
  {
    type: "trello_trigger_card_updated",
    title: "Card Updated",
    description: "Triggers when a card's properties change (name, desc, due, fields, labels, etc.)",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", dynamic: "trello-boards", required: false },
      { name: "listId", label: "List", type: "select", dynamic: "trello_lists", dependsOn: "boardId", required: false }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string" },
      { name: "listId", label: "List ID", type: "string" },
      { name: "cardId", label: "Card ID", type: "string" },
      { name: "changedFields", label: "Changed Fields", type: "object" },
      { name: "previousValues", label: "Previous Values", type: "object" },
      { name: "updatedAt", label: "Updated At", type: "string" }
    ]
  },
  {
    type: "trello_trigger_card_moved",
    title: "Card Moved",
    description: "Triggers when a card is moved between lists or boards",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", dynamic: "trello-boards", required: false }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string" },
      { name: "fromListId", label: "From List ID", type: "string" },
      { name: "toListId", label: "To List ID", type: "string" },
      { name: "cardId", label: "Card ID", type: "string" },
      { name: "movedAt", label: "Moved At", type: "string" }
    ]
  },
  {
    type: "trello_trigger_comment_added",
    title: "Comment Added",
    description: "Triggers when a new comment is added to a card",
    icon: MessageSquare,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", dynamic: "trello-boards", required: false }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string" },
      { name: "cardId", label: "Card ID", type: "string" },
      { name: "commentId", label: "Comment ID", type: "string" },
      { name: "commentText", label: "Comment Text", type: "string" },
      { name: "authorId", label: "Author ID", type: "string" },
      { name: "authorName", label: "Author Name", type: "string" },
      { name: "createdAt", label: "Created At", type: "string" }
    ]
  },
  {
    type: "trello_trigger_member_changed",
    title: "Card Members Changed",
    description: "Triggers when a member is added to or removed from a card",
    icon: Users,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
    configSchema: [
      { name: "boardId", label: "Board", type: "select", dynamic: "trello-boards", required: false }
    ],
    outputSchema: [
      { name: "boardId", label: "Board ID", type: "string" },
      { name: "cardId", label: "Card ID", type: "string" },
      { name: "action", label: "Action", type: "string" },
      { name: "memberId", label: "Member ID", type: "string" },
      { name: "memberName", label: "Member Name", type: "string" },
      { name: "changedAt", label: "Changed At", type: "string" }
    ]
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
    title: "New File",
    description: "Triggers when a new file is added to a folder",
    icon: Upload,
    providerId: "dropbox",
    category: "Storage",
    isTrigger: true,
  },
  {
    type: "dropbox_action_upload_file",
    title: "Upload File",
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
    title: "Upload File from URL",
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
    type: "youtube_action_update_video",
    title: "Update Video Details",
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
    title: "Delete Video",
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
    title: "Get Video Analytics",
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
    title: "Add Video to Playlist",
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
    title: "List My Playlists",
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
    title: "New Order",
    description: "Triggers when a new order is placed",
    icon: ShoppingCart,
    providerId: "shopify",
    category: "eCommerce",
    isTrigger: true,
    comingSoon: true,
  },
  {
    type: "shopify_action_create_product",
    title: "Create Product",
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
    comingSoon: true,
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
    comingSoon: true,
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
    comingSoon: true,
  },
  {
    type: "kit_trigger_tag_added",
    title: "Tag added to a subscriber",
    description: "Triggers when a tag is added to a subscriber",
    icon: BarChart,
    providerId: "kit",
    category: "Email",
    isTrigger: true,
    comingSoon: true,
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
    comingSoon: true,
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
    comingSoon: true,
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
    comingSoon: true,
  },
  {
    type: "paypal_trigger_new_subscription",
    title: "New subscription created",
    description: "Triggers when a new subscription is created",
    icon: Repeat,
    providerId: "paypal",
    category: "Finance",
    isTrigger: true,
    comingSoon: true,
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
    comingSoon: true,
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
    comingSoon: true,
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

  // Stripe
  {
    type: "stripe_trigger_customer_created",
    title: "Customer Created",
    description: "Triggers when a new customer is created in Stripe",
    icon: UserPlus,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "customerId", label: "Customer ID", type: "string", description: "The unique ID of the created customer" },
      { name: "email", label: "Email", type: "string", description: "The customer's email address" },
      { name: "name", label: "Name", type: "string", description: "The customer's full name" },
      { name: "phone", label: "Phone", type: "string", description: "The customer's phone number" },
      { name: "created", label: "Created Date", type: "string", description: "When the customer was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the customer" }
    ],
  },
  {
    type: "stripe_trigger_payment_succeeded",
    title: "Payment Succeeded",
    description: "Triggers when a payment is completed successfully",
    icon: CreditCard,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "The unique ID of the payment intent" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who made the payment" },
      { name: "amount", label: "Amount", type: "number", description: "The payment amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The payment currency (e.g., usd)" },
      { name: "status", label: "Status", type: "string", description: "The payment status" },
      { name: "created", label: "Created Date", type: "string", description: "When the payment was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the payment" }
    ],
  },
  {
    type: "stripe_trigger_subscription_created",
    title: "Subscription Created",
    description: "Triggers when a new subscription is created",
    icon: Repeat,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who subscribed" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "string", description: "Start of current billing period" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "string", description: "End of current billing period" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "created", label: "Created Date", type: "string", description: "When the subscription was created" }
    ],
  },
  {
    type: "stripe_trigger_subscription_deleted",
    title: "Subscription Cancelled",
    description: "Triggers when a subscription is cancelled",
    icon: XCircle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the cancelled subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who cancelled" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "canceledAt", label: "Cancelled At", type: "string", description: "When the subscription was cancelled" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "reason", label: "Cancellation Reason", type: "string", description: "Reason for cancellation if provided" }
    ],
  },
  {
    type: "stripe_trigger_invoice_payment_failed",
    title: "Invoice Payment Failed",
    description: "Triggers when a subscription payment fails",
    icon: AlertTriangle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "invoiceId", label: "Invoice ID", type: "string", description: "The unique ID of the failed invoice" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer whose payment failed" },
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The subscription with the failed payment" },
      { name: "amount", label: "Amount", type: "number", description: "The invoice amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The invoice currency" },
      { name: "attemptCount", label: "Attempt Count", type: "number", description: "Number of payment attempts made" },
      { name: "nextPaymentAttempt", label: "Next Payment Attempt", type: "string", description: "When the next retry will occur" },
      { name: "failureReason", label: "Failure Reason", type: "string", description: "Reason for payment failure" }
    ],
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
  {
    type: "microsoft-outlook_action_add_folder",
    title: "Add to Folder",
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
    title: "Archive Email",
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
    title: "Search Email",
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
    title: "Slash Command",
    description: "Triggers when a slash command is used",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [{ name: "command", label: "Command", type: "text", required: true, placeholder: "/my-command" }],
    outputSchema: [
      {
        name: "commandName",
        label: "Command Name",
        type: "string",
        description: "The name of the slash command that was used"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who used the command"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The display name of the user who used the command"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the command was used"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the command was used"
      },
      {
        name: "teamId",
        label: "Workspace ID",
        type: "string",
        description: "The ID of the Slack workspace"
      },
      {
        name: "text",
        label: "Command Text",
        type: "string",
        description: "The text/parameters passed with the command"
      },
      {
        name: "responseUrl",
        label: "Response URL",
        type: "string",
        description: "URL to send delayed responses to the command"
      }
    ],
  },
  {
    type: "slack_action_post_interactive",
    title: "Post Interactive Blocks",
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
    title: "Slash Command",
    description: "Triggers when a slash command is used",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    configSchema: [{ name: "command", label: "Command", type: "text" }],
    outputSchema: [
      {
        name: "commandName",
        label: "Command Name",
        type: "string",
        description: "The name of the slash command that was used"
      },
      {
        name: "userId",
        label: "User ID",
        type: "string",
        description: "The ID of the user who used the command"
      },
      {
        name: "userName",
        label: "User Name",
        type: "string",
        description: "The username of the user who used the command"
      },
      {
        name: "channelId",
        label: "Channel ID",
        type: "string",
        description: "The ID of the channel where the command was used"
      },
      {
        name: "channelName",
        label: "Channel Name",
        type: "string",
        description: "The name of the channel where the command was used"
      },
      {
        name: "guildId",
        label: "Server ID",
        type: "string",
        description: "The ID of the Discord server"
      },
      {
        name: "guildName",
        label: "Server Name",
        type: "string",
        description: "The name of the Discord server"
      },
      {
        name: "options",
        label: "Command Options",
        type: "object",
        description: "The options/parameters passed with the command"
      },
      {
        name: "timestamp",
        label: "Command Time",
        type: "string",
        description: "When the command was used (ISO 8601 format)"
      }
    ]
  },



  // ManyChat Triggers and Actions
  {
    type: "manychat_trigger_new_subscriber",
    title: "New Subscriber",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "manychat",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    comingSoon: true,
  },
  {
    type: "manychat_action_send_message",
    title: "Send Message",
    description: "Send a message to a subscriber",
    icon: Send,
    providerId: "manychat",
    category: "Communication",
    isTrigger: false,
  },
  {
    type: "manychat_action_tag_subscriber",
    title: "Tag Subscriber",
    description: "Add a tag to a subscriber",
    icon: Edit,
    providerId: "manychat",
    category: "Communication",
    isTrigger: false,
  },

  // beehiiv Triggers and Actions
  {
    type: "beehiiv_trigger_new_subscriber",
    title: "New Subscriber",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: true,
    producesOutput: true,
    comingSoon: true,
  },
  {
    type: "beehiiv_action_add_subscriber",
    title: "Add Subscriber",
    description: "Add a new subscriber",
    icon: Plus,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: false,
  },
  {
    type: "beehiiv_action_send_newsletter",
    title: "Send Newsletter",
    description: "Send a newsletter to your subscribers",
    icon: Send,
    providerId: "beehiiv",
    category: "Communication",
    isTrigger: false,
  },

  // Google Docs Actions
  {
    type: "google_docs_action_create_document",
    title: "Create Document",
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
    title: "Update Document",
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
    title: "Share Document",
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
    title: "Export Document",
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

  // Google Docs Triggers
  {
    type: "google_docs_trigger_new_document",
    title: "New Document Created",
    description: "Triggers when a new Google Document is created",
    icon: FileText,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    outputSchema: [
      {
        name: "documentId",
        label: "Document ID",
        type: "string",
        description: "The unique ID of the created document"
      },
      {
        name: "title",
        label: "Document Title",
        type: "string",
        description: "The title of the created document"
      },
      {
        name: "createdAt",
        label: "Created At",
        type: "string",
        description: "The timestamp when the document was created"
      },
      {
        name: "createdBy",
        label: "Created By",
        type: "string",
        description: "The email address of the user who created the document"
      },
      {
        name: "documentUrl",
        label: "Document URL",
        type: "string",
        description: "The URL to access the document"
      },
      {
        name: "folderId",
        label: "Folder ID",
        type: "string",
        description: "The ID of the folder where the document was created (if any)"
      }
    ]
  },
  {
    type: "google_docs_trigger_document_updated",
    title: "Document Updated",
    description: "Triggers when a Google Document is modified or updated",
    icon: Edit,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_recent_documents",
        required: false,
        placeholder: "Select a specific document to monitor (optional)",
        description: "Leave empty to monitor all documents, or select a specific document"
      }
    ],
    outputSchema: [
      {
        name: "documentId",
        label: "Document ID",
        type: "string",
        description: "The unique ID of the updated document"
      },
      {
        name: "title",
        label: "Document Title",
        type: "string",
        description: "The title of the updated document"
      },
      {
        name: "updatedAt",
        label: "Updated At",
        type: "string",
        description: "The timestamp when the document was last updated"
      },
      {
        name: "updatedBy",
        label: "Updated By",
        type: "string",
        description: "The email address of the user who made the update"
      },
      {
        name: "documentUrl",
        label: "Document URL",
        type: "string",
        description: "The URL to access the document"
      },
      {
        name: "changeType",
        label: "Change Type",
        type: "string",
        description: "The type of change made (content, metadata, etc.)"
      },
      {
        name: "contentLength",
        label: "Content Length",
        type: "number",
        description: "The length of the document content after the update"
      }
    ]
  },

  // GitHub Actions
  {
    type: "github_action_create_repository",
    title: "Create Repository",
    description: "Create a new GitHub repository",
    icon: GitBranch,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Pull Request",
    description: "Create a new pull request",
    icon: GitPullRequest,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Gist",
    description: "Create a new GitHub Gist",
    icon: FileText,
    providerId: "github",
    requiredScopes: ["gist"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Gist description" },
      { name: "filename", label: "Filename", type: "text", required: true, placeholder: "example.js" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Enter file content" },
      { name: "isPublic", label: "Public Gist", type: "boolean", required: false, defaultValue: false }
    ]
  },
  {
    type: "github_action_add_comment",
    title: "Add Comment",
    description: "Add a comment to an issue or pull request",
    icon: MessageSquare,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/repo-name" },
      { name: "issueNumber", label: "Issue/PR Number", type: "number", required: true, placeholder: "123" },
      { name: "body", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment" }
    ]
  },

  // GitLab Actions
  {
    type: "gitlab_action_create_project",
    title: "Create Project",
    description: "Create a new GitLab project",
    icon: GitBranch,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Merge Request",
    description: "Create a new merge request",
    icon: GitPullRequest,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Issue",
    description: "Create a new issue in a GitLab project",
    icon: AlertCircle,
    providerId: "gitlab",
    requiredScopes: ["api"],
    category: "Developer",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Post",
    description: "Create a new post on a Facebook page",
    icon: Share,
    providerId: "facebook",
    requiredScopes: ["pages_manage_posts"],
    category: "Social",
    isTrigger: false,
    configSchema: [
      { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your post message", uiTab: "basic" },
      { name: "mediaFile", label: "Photo/Video", type: "file", required: false, accept: "image/*,video/*", maxSize: 10485760, uiTab: "basic" },
      { name: "scheduledPublishTime", label: "Schedule Publish Time", type: "datetime", required: false, uiTab: "basic", placeholder: "Select date and time for publishing" },
      // Monetization section
      { name: "productLinkUrl", label: "URL", type: "text", required: false, placeholder: "URL", uiTab: "monetization" },
      { name: "productLinkName", label: "Link name (optional)", type: "text", required: false, placeholder: "Link name (optional)", uiTab: "monetization" },
      { name: "productPromoCode", label: "Existing promo code (optional)", type: "text", required: false, placeholder: "Existing promo code (optional)", uiTab: "monetization" },
      { name: "paidPartnershipLabel", label: "Add paid partnership label", type: "boolean", required: false, defaultValue: false, uiTab: "monetization" }
    ]
  },
  {
    type: "facebook_action_get_page_insights",
    title: "Fetch Page Insights",
    description: "Fetch analytics data for a Facebook page",
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
  {
    type: "facebook_action_send_message",
    title: "Send Message",
    description: "Send a message to a person who has a conversation with the page",
    icon: MessageSquare,
    providerId: "facebook",
    requiredScopes: ["pages_messaging"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
      { name: "recipientId", label: "Message", type: "select", dynamic: "facebook_conversations", required: true, placeholder: "Select a conversation", uiTab: "basic", dependsOn: "pageId" },
      { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message", uiTab: "basic" },
      { name: "quickReplies", label: "Quick Reply Options", type: "textarea", required: false, placeholder: "Enter quick reply options (one per line)", uiTab: "advanced" },
      { name: "typingIndicator", label: "Show Typing Indicator", type: "boolean", required: false, defaultValue: true, uiTab: "advanced" }
    ]
  },
  {
    type: "facebook_action_comment_on_post",
    title: "Comment On Post",
    description: "Add a comment to a Facebook post",
    icon: MessageCircle,
    providerId: "facebook",
    requiredScopes: ["pages_manage_posts"],
    category: "Social",
    isTrigger: false,
    comingSoon: true,
    configSchema: [
      { name: "pageId", label: "Page", type: "select", dynamic: "facebook_pages", required: true, placeholder: "Select a Facebook page", uiTab: "basic" },
      { name: "postId", label: "Post", type: "select", dynamic: "facebook_posts", required: true, placeholder: "Select a post", uiTab: "basic", dependsOn: "pageId" },
      { name: "comment", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment", uiTab: "basic" },
      { name: "attachmentUrl", label: "Attachment URL", type: "text", required: false, placeholder: "URL to attach to the comment", uiTab: "advanced" },
      { name: "attachmentType", label: "Attachment Type", type: "select", required: false, options: [
        { value: "photo", label: "Photo" },
        { value: "video", label: "Video" },
        { value: "link", label: "Link" }
      ], uiTab: "advanced" }
    ]
  },

  // Instagram Actions
  {
    type: "instagram_action_create_story",
    title: "Create Story",
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
    title: "Get Media Insights",
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
    title: "Share Post",
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
    title: "Create Company Post",
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
    title: "Get User Info",
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
    title: "Get Video List",
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
            title: "Create Database",
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
            title: "Search Pages",
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
            title: "Update Page",
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
    title: "Create Board",
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
    title: "Create List",
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
    title: "Move Card",
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
    title: "Create Company",
    description: "Create a new company in HubSpot",
    icon: Building,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.companies.write"],
    category: "CRM",
    isTrigger: false,
    comingSoon: true,
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
    title: "Create Deal",
    description: "Create a new deal in HubSpot",
    icon: DollarSign,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.deals.write"],
    category: "CRM",
    isTrigger: false,
    comingSoon: true,
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
    title: "Add Contact to List",
    description: "Add a contact to a HubSpot list",
    icon: Users,
    providerId: "hubspot",
    requiredScopes: ["lists.read", "lists.write"],
    category: "CRM",
    isTrigger: false,
    comingSoon: true,
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
    title: "Update Deal",
    description: "Update an existing deal in HubSpot",
    icon: Edit,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.deals.write"],
    category: "CRM",
    isTrigger: false,
    comingSoon: true,
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
    title: "Update Record",
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
    type: "airtable_action_list_records",
    title: "List Records",
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
    title: "Create Order",
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
    title: "Update Product",
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
    title: "Create Customer",
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
    title: "Create Payment Intent",
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
    title: "Create Invoice",
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
    title: "Create Subscription",
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
    title: "Create Order",
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
    title: "Create Payout",
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
    title: "Upload File",
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
    title: "Create Folder",
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
    title: "Share File",
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
    title: "Send Email",
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
      { name: "body", label: "Body", type: "email-rich-text", required: true, placeholder: "Compose your email...", provider: "outlook" },
      { name: "attachments", label: "Attachments", type: "file", required: false, placeholder: "Select files to attach", multiple: true, description: "Attach files from your computer or select files from previous workflow nodes" }
    ]
  },
  {
    type: "microsoft-outlook_action_create_calendar_event",
    title: "Create Calendar Event",
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
      { name: "startTime", label: "Start Time", type: "time", required: true, defaultValue: "current" },
      { name: "endDate", label: "End Date", type: "date", required: true, defaultValue: "same-as-start" },
      { name: "endTime", label: "End Time", type: "time", required: true, defaultValue: "current" },
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
      ]}
    ]
  },
  {
    type: "microsoft-outlook_action_create_contact",
    title: "Create Contact",
    description: "Create a new contact in Outlook",
    icon: UserPlus,
    providerId: "microsoft-outlook",
    requiredScopes: ["Contacts.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "givenName", label: "First Name", type: "text", required: true, placeholder: "John" },
      { name: "surname", label: "Last Name", type: "text", required: true, placeholder: "Doe" },
      { name: "emailAddresses", label: "Email Addresses", type: "text", required: true, placeholder: "john.doe@example.com" },
      { name: "businessPhones", label: "Business Phone", type: "text", required: false, placeholder: "+1-555-123-4567" },
      { name: "companyName", label: "Company", type: "text", required: false, placeholder: "Company Name" },
      { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "Software Engineer" }
    ]
  },
  {
    type: "microsoft-outlook_action_move_email",
    title: "Move Email",
    description: "Move an email to a different folder",
    icon: Move,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Email", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select an email", hasVariablePicker: true },
      { name: "sourceFolderId", label: "Source Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select source folder (optional)" },
      { name: "destinationFolderId", label: "Destination Folder", type: "select", required: true, dynamic: "outlook_folders", placeholder: "Select destination folder", hasVariablePicker: true },
    ]
  },
  {
    type: "microsoft-outlook_action_mark_as_read",
    title: "Mark Email as Read",
    description: "Mark an email as read",
    icon: Check,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Email", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select an email" },
    ]
  },
  {
    type: "microsoft-outlook_action_mark_as_unread",
    title: "Mark Email as Unread",
    description: "Mark an email as unread",
    icon: X,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.ReadWrite"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Email", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select an email" },
    ]
  },
  {
    type: "microsoft-outlook_action_reply_to_email",
    title: "Reply to Email",
    description: "Reply to an existing email",
    icon: Reply,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Send"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Email", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select an email to reply to", description: "Search for emails by sender, subject, or content" },
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Email subject" },
      { name: "body", label: "Body", type: "email-rich-text", required: true, placeholder: "Compose your reply...", provider: "outlook" },
      { name: "attachments", label: "Attachments", type: "file", required: false, placeholder: "Select files to attach", multiple: true, description: "Attach files from your computer or select files from previous workflow nodes" }
    ]
  },
  {
    type: "microsoft-outlook_action_forward_email",
    title: "Forward Email",
    description: "Forward an email to other recipients",
    icon: Forward,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Send"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "messageId", label: "Email", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select an email" },
      { name: "to", label: "To", type: "email-autocomplete", required: true, placeholder: "Enter recipient email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "cc", label: "CC", type: "email-autocomplete", required: false, placeholder: "Enter CC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "bcc", label: "BCC", type: "email-autocomplete", required: false, placeholder: "Enter BCC email addresses...", dynamic: "outlook-enhanced-recipients" },
      { name: "body", label: "Additional Note", type: "email-rich-text", required: false, placeholder: "Additional note to include with the forwarded email", provider: "outlook" },
    ]
  },
  {
    type: "microsoft-outlook_action_fetch_emails",
    title: "Fetch Emails",
    description: "Retrieve emails from a specific folder",
    icon: MailOpen,
    providerId: "microsoft-outlook",
    requiredScopes: ["Mail.Read"],
    category: "Communication",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { name: "folderId", label: "Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select a folder (uses inbox if not specified)" },
      { name: "limit", label: "Number of Emails", type: "select", required: false, defaultValue: "10", options: [
        { value: "5", label: "5 emails" },
        { value: "10", label: "10 emails" },
        { value: "25", label: "25 emails" },
        { value: "50", label: "50 emails" },
        { value: "100", label: "100 emails" }
      ]},
      { name: "unreadOnly", label: "Unread Only", type: "boolean", required: false, defaultValue: false },
    ]
  },
  {
    type: "microsoft-outlook_action_get_contacts",
    title: "Fetch Contacts",
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
    title: "Fetch Calendar Events",
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
    title: "Create Page",
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
    title: "Create Section",
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
    title: "Update Page",
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
    title: "New Video",
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
    title: "New Comment",
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
    title: "Upload Video",
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
    title: "Get Video Analytics",
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
    title: "New Comment",
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
    title: "Channel Analytics Update",
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
    title: "Moderate Comment",
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
    title: "Get Channel Analytics",
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
    title: "New Donor",
    description: "Triggers when a new donor is added to the system",
    icon: UserPlus,
    providerId: "blackbaud",
    category: "Other",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { name: "constituentType", label: "Constituent Type", type: "select", required: false, options: [
        { value: "Individual", label: "Individual" },
        { value: "Organization", label: "Organization" }
      ] }
    ]
  },
  {
    type: "blackbaud_trigger_new_donation",
    title: "New Donation",
    description: "Triggers when a new donation is received",
    icon: DollarSign,
    providerId: "blackbaud",
    category: "Other",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum donation amount" },
      { name: "fundId", label: "Fund ID", type: "text", required: false, placeholder: "Specific fund ID to monitor" }
    ]
  },

  // Blackbaud Actions
  {
    type: "blackbaud_action_create_constituent",
    title: "Create Constituent",
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
    title: "Create Donation",
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
    title: "New Sale",
    description: "Triggers when a new sale is made on Gumroad",
    icon: ShoppingCart,
    providerId: "gumroad",
    category: "E-commerce",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" },
      { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum sale amount" }
    ]
  },
  {
    type: "gumroad_trigger_new_subscriber",
    title: "New Subscriber",
    description: "Triggers when someone subscribes to your Gumroad product",
    icon: UserPlus,
    providerId: "gumroad",
    category: "E-commerce",
    isTrigger: true,
    comingSoon: true,
    configSchema: [
      { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" }
    ]
  },

  // Gumroad Actions
  {
    type: "gumroad_action_create_product",
    title: "Create Product",
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
    title: "Get Sales Analytics",
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

  // Discord Advanced Actions
  {
    type: "discord_action_edit_message",
    title: "Edit Message",
    description: "Edit a message in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { name: "content", label: "New Content", type: "discord-rich-text", provider: "discord", required: true, placeholder: "Enter new message content with formatting, mentions, and emojis" }
    ]
  },
  {
    type: "discord_action_delete_message",
    title: "Delete Message",
    description: "Delete a message in a Discord channel.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" }
    ]
  },
  {
    type: "discord_action_fetch_messages",
    title: "Fetch Messages",
    description: "List recent messages from a Discord channel with optional filters.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "limit", label: "Limit", type: "number", required: false, placeholder: "Number of messages (max 100)", defaultValue: 20 },
      { name: "filterType", label: "Filter Type", type: "select", required: false, options: [
        { value: "none", label: "No Filter" },
        { value: "author", label: "Filter by Author" },
        { value: "content", label: "Filter by Content" },
        { value: "has_attachments", label: "Has Attachments" },
        { value: "has_embeds", label: "Has Embeds" },
        { value: "is_pinned", label: "Pinned Messages" },
        { value: "from_bots", label: "From Bots" },
        { value: "from_humans", label: "From Humans" },
        { value: "has_reactions", label: "Has Reactions" }
      ], defaultValue: "none" },
      { name: "filterAuthor", label: "Author", type: "select", dynamic: "discord_members", required: false, dependsOn: "guildId", placeholder: "Select an author to filter by", description: "Only show messages from this user" },
      { name: "filterContent", label: "Content Contains", type: "text", required: false, placeholder: "Text to search for in messages", description: "Only show messages containing this text" },
      { name: "caseSensitive", label: "Case Sensitive Search", type: "boolean", required: false, defaultValue: false, description: "Whether content search should be case sensitive" }
    ]
  },
  {
    type: "discord_action_add_reaction",
    title: "Add Reaction",
    description: "Add an emoji reaction to a message.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { 
        name: "emoji", 
        label: "Reaction", 
        type: "select", 
        required: true, 
        placeholder: "Select a reaction to add",
        options: [
          { value: "👍", label: "👍 Thumbs Up" },
          { value: "👎", label: "👎 Thumbs Down" },
          { value: "❤️", label: "❤️ Heart" },
          { value: "🔥", label: "🔥 Fire" },
          { value: "😄", label: "😄 Grinning Face" },
          { value: "😢", label: "😢 Crying Face" },
          { value: "😡", label: "😡 Angry Face" },
          { value: "🎉", label: "🎉 Party Popper" },
          { value: "👏", label: "👏 Clapping Hands" },
          { value: "🙏", label: "🙏 Folded Hands" },
          { value: "🤔", label: "🤔 Thinking Face" },
          { value: "😱", label: "😱 Face Screaming in Fear" },
          { value: "😴", label: "😴 Sleeping Face" },
          { value: "🤮", label: "🤮 Face Vomiting" },
          { value: "💯", label: "💯 Hundred Points" },
          { value: "💪", label: "💪 Flexed Biceps" },
          { value: "👀", label: "👀 Eyes" },
          { value: "👻", label: "👻 Ghost" },
          { value: "🤖", label: "🤖 Robot" },
          { value: "👾", label: "👾 Alien Monster" },
          { value: "🎮", label: "🎮 Video Game" },
          { value: "🎯", label: "🎯 Direct Hit" },
          { value: "🎪", label: "🎪 Circus Tent" },
          { value: "🎨", label: "🎨 Artist Palette" },
          { value: "⚡", label: "⚡ High Voltage" },
          { value: "💥", label: "💥 Collision" },
          { value: "🌟", label: "🌟 Glowing Star" },
          { value: "✨", label: "✨ Sparkles" },
          { value: "💎", label: "💎 Gem Stone" },
          { value: "🏆", label: "🏆 Trophy" },
          { value: "🥇", label: "🥇 1st Place Medal" },
          { value: "🥈", label: "🥈 2nd Place Medal" },
          { value: "🚀", label: "🚀 Rocket" },
          { value: "💸", label: "💸 Money with Wings" },
          { value: "💰", label: "💰 Money Bag" },
          { value: "💳", label: "💳 Credit Card" },
          { value: "🎁", label: "🎁 Wrapped Gift" },
          { value: "🎊", label: "🎊 Confetti Ball" },
          { value: "🎈", label: "🎈 Balloon" },
          { value: "🎂", label: "🎂 Birthday Cake" },
          { value: "🍕", label: "🍕 Pizza" },
          { value: "🍔", label: "🍔 Hamburger" },
          { value: "🍦", label: "🍦 Soft Ice Cream" },
          { value: "🍺", label: "🍺 Beer Mug" },
          { value: "☕", label: "☕ Hot Beverage" },
          { value: "🍷", label: "🍷 Wine Glass" },
          { value: "🍸", label: "🍸 Cocktail Glass" },
          { value: "🍹", label: "🍹 Tropical Drink" },
          { value: "🌮", label: "🌮 Taco" },
          { value: "🍣", label: "🍣 Sushi" },
          { value: "🍜", label: "🍜 Steaming Bowl" },
          { value: "🍱", label: "🍱 Bento Box" },
          { value: "🥘", label: "🥘 Pan of Food" },
          { value: "🍲", label: "🍲 Pot of Food" },
          { value: "🥗", label: "🥗 Green Salad" },
          { value: "🥙", label: "🥙 Stuffed Flatbread" },
          { value: "🐶", label: "🐶 Dog Face" },
          { value: "🐱", label: "🐱 Cat Face" },
          { value: "🐭", label: "🐭 Mouse Face" },
          { value: "🐹", label: "🐹 Hamster Face" },
          { value: "🐰", label: "🐰 Rabbit Face" },
          { value: "🦊", label: "🦊 Fox Face" },
          { value: "🐻", label: "🐻 Bear Face" },
          { value: "🐼", label: "🐼 Panda Face" }
        ]
      }
    ]
  },
  {
    type: "discord_action_remove_reaction",
    title: "Remove Reaction",
    description: "Remove an emoji reaction from a message.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", placeholder: "Select a channel" },
      { name: "messageId", label: "Message", type: "select", dynamic: "discord_messages", required: true, dependsOn: "channelId", placeholder: "Select a message" },
      { name: "emoji", label: "Reaction to Remove", type: "hidden", required: true }
    ]
  },

  {
    type: "discord_action_create_channel",
    title: "Create Channel",
    description: "Create a new Discord channel with advanced configuration options.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "name", label: "Channel Name", type: "text", required: true, uiTab: "basic" },
      { name: "type", label: "Channel Type", type: "select", options: [
        { value: "0", label: "Text Channel" },
        { value: "2", label: "Voice Channel" },
        { value: "5", label: "Announcement Channel" },
        { value: "13", label: "Stage Channel" },
        { value: "15", label: "Forum Channel" },
        { value: "16", label: "Media Channel" }
      ], required: true, defaultValue: "0", uiTab: "basic" },
      { name: "parentId", label: "Category", type: "select", dynamic: "discord_categories", required: false, uiTab: "basic", description: "Category to place this channel in", dependsOn: "guildId", placeholder: "Select a category (optional)" },
      
      // Advanced Settings Tab
      { name: "topic", label: "Topic", type: "text", required: false, uiTab: "advanced", description: "Channel description (text channels only)" },
      { name: "nsfw", label: "Age-Restricted Channel", type: "boolean", required: false, uiTab: "advanced", description: "Mark channel as age-restricted (NSFW)", defaultValue: false },
      
      // Text Channel Specific Fields (uiTab: "advanced")
      { name: "rateLimitPerUser", label: "Rate Limit Per User", type: "number", required: false, uiTab: "advanced", description: "Slowmode in seconds (0-21600)", min: 0, max: 21600 },
      { name: "defaultAutoArchiveDuration", label: "Default Auto-Archive Duration", type: "select", required: false, uiTab: "advanced", options: [
        { value: "60", label: "1 Hour" },
        { value: "1440", label: "24 Hours" },
        { value: "4320", label: "3 Days" },
        { value: "10080", label: "1 Week" }
      ], description: "Default auto-archive duration for threads" },
      
      // Voice Channel Specific Fields (uiTab: "advanced")
      { name: "bitrate", label: "Bitrate", type: "number", required: false, uiTab: "advanced", description: "Voice channel bitrate (8000-128000)", min: 8000, max: 128000, defaultValue: 64000 },
      { name: "userLimit", label: "User Limit", type: "number", required: false, uiTab: "advanced", description: "Maximum number of users (0-99, 0 = no limit)", min: 0, max: 99 },
      { name: "rtcRegion", label: "Voice Region", type: "text", required: false, uiTab: "advanced", description: "Voice region ID (auto, us-east, us-west, etc.)" },
      
      // Forum Channel Specific Fields (uiTab: "advanced")
      { name: "defaultReactionEmoji", label: "Default Reaction Emoji", type: "text", required: false, uiTab: "advanced", description: "Default reaction emoji for forum posts" },
      { name: "defaultThreadRateLimitPerUser", label: "Default Thread Rate Limit", type: "number", required: false, uiTab: "advanced", description: "Default rate limit per user for threads", min: 0, max: 21600 },
      { name: "defaultSortOrder", label: "Default Sort Order", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Latest Activity" },
        { value: "1", label: "Creation Date" }
      ], description: "Default sort order for forum posts" },
      { name: "defaultForumLayout", label: "Default Forum Layout", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Not Set" },
        { value: "1", label: "List View" },
        { value: "2", label: "Gallery View" }
      ], description: "Default layout for forum posts" },
      
      // Advanced Settings Tab
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" },
      { name: "availableTags", label: "Available Tags", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of available tags for forum channels" }
          ]
    },
  {
    type: "discord_action_update_channel",
    title: "Update Channel",
    description: "Update a channel's name, topic, or permissions.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a channel" },
      { name: "name", label: "New Name", type: "text", required: false, uiTab: "basic" },
      
      // Advanced Settings Tab
      { name: "topic", label: "Topic", type: "text", required: false, uiTab: "advanced", description: "Channel description (text channels only)" },
      { name: "nsfw", label: "Age-Restricted Channel", type: "boolean", required: false, uiTab: "advanced", description: "Mark channel as age-restricted (NSFW)", defaultValue: false },
      
      // Text Channel Specific Fields (uiTab: "advanced")
      { name: "rateLimitPerUser", label: "Rate Limit Per User", type: "number", required: false, uiTab: "advanced", description: "Slowmode in seconds (0-21600)", min: 0, max: 21600 },
      { name: "defaultAutoArchiveDuration", label: "Default Auto-Archive Duration", type: "select", required: false, uiTab: "advanced", options: [
        { value: "60", label: "1 Hour" },
        { value: "1440", label: "24 Hours" },
        { value: "4320", label: "3 Days" },
        { value: "10080", label: "1 Week" }
      ], description: "Default auto-archive duration for threads" },
      
      // Voice Channel Specific Fields (uiTab: "advanced")
      { name: "bitrate", label: "Bitrate", type: "number", required: false, uiTab: "advanced", description: "Voice channel bitrate (8000-128000)", min: 8000, max: 128000, defaultValue: 64000 },
      { name: "userLimit", label: "User Limit", type: "number", required: false, uiTab: "advanced", description: "Maximum number of users (0-99, 0 = no limit)", min: 0, max: 99 },
      { name: "rtcRegion", label: "Voice Region", type: "text", required: false, uiTab: "advanced", description: "Voice region ID (auto, us-east, us-west, etc.)" },
      
      // Forum Channel Specific Fields (uiTab: "advanced")
      { name: "defaultReactionEmoji", label: "Default Reaction Emoji", type: "text", required: false, uiTab: "advanced", description: "Default reaction emoji for forum posts" },
      { name: "defaultThreadRateLimitPerUser", label: "Default Thread Rate Limit", type: "number", required: false, uiTab: "advanced", description: "Default rate limit per user for threads", min: 0, max: 21600 },
      { name: "defaultSortOrder", label: "Default Sort Order", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Latest Activity" },
        { value: "1", label: "Creation Date" }
      ], description: "Default sort order for forum posts" },
      { name: "defaultForumLayout", label: "Default Forum Layout", type: "select", required: false, uiTab: "advanced", options: [
        { value: "0", label: "Not Set" },
        { value: "1", label: "List View" },
        { value: "2", label: "Gallery View" }
      ], description: "Default layout for forum posts" },
      
      // Advanced Settings Tab
      { name: "position", label: "Position", type: "number", required: false, uiTab: "advanced", description: "Channel position in the list" },
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" },
      { name: "availableTags", label: "Available Tags", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of available tags for forum channels" }
    ]
  },
  {
    type: "discord_action_delete_channel",
    title: "Delete Channel",
    description: "Delete a channel in a Discord server with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "channelId", label: "Channel", type: "select", dynamic: "discord_channels", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a channel" },
      
      // Advanced Settings Tab
      { name: "channelTypes", label: "Channel Types", type: "multi-select", required: false, uiTab: "advanced", description: "Filter by channel types", options: [
        { value: "0", label: "Text Channels" },
        { value: "2", label: "Voice Channels" },
        { value: "4", label: "Categories" },
        { value: "5", label: "Announcement Channels" },
        { value: "13", label: "Stage Channels" },
        { value: "15", label: "Forum Channels" }
      ]},
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter channels by name (case-insensitive)", placeholder: "e.g., general, admin, support" },
      { name: "parentCategory", label: "Parent Category", type: "select", dynamic: "discord_categories", required: false, uiTab: "advanced", description: "Only show channels in this category", dependsOn: "guildId", placeholder: "Select a category (optional)" }
    ]
  },
  {
    type: "discord_action_create_category",
    title: "Create Category",
    description: "Create a new Discord category to organize channels.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "name", label: "Category Name", type: "text", required: true, uiTab: "basic" },
      { name: "private", label: "Private Category", type: "boolean", required: false, uiTab: "basic", description: "Make this category private (only visible to specific roles)", defaultValue: false },
      
      // Advanced Settings Tab
      { name: "position", label: "Position", type: "number", required: false, uiTab: "advanced", description: "Category position in the list" },
      { name: "permissionOverwrites", label: "Permission Overwrites", type: "textarea", required: false, uiTab: "advanced", description: "JSON array of permission overwrites" }
    ]
  },
  {
    type: "discord_action_delete_category",
    title: "Delete Category",
    description: "Delete a Discord category and optionally move its channels with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "categoryId", label: "Category", type: "select", dynamic: "discord_categories", required: true, dependsOn: "guildId", uiTab: "basic", placeholder: "Select a category" },
      { name: "moveChannels", label: "Move Channels to General", type: "boolean", required: false, uiTab: "basic", description: "Move channels from this category to the general area before deleting", defaultValue: true },
      
      // Advanced Settings Tab
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter categories by name (case-insensitive)", placeholder: "e.g., admin, public, private" },
      { name: "sortBy", label: "Sort By", type: "select", required: false, uiTab: "advanced", description: "How to sort the categories", options: [
        { value: "position", label: "Position (default)" },
        { value: "name", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "created", label: "Newest First" },
        { value: "created_old", label: "Oldest First" }
      ], defaultValue: "position" }
    ]
  },
  {
    type: "discord_action_fetch_guild_members",
    title: "Fetch Guild Members",
    description: "List members in a Discord server with optional filtering.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      // Basic Settings Tab
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, uiTab: "basic", placeholder: "Select a Discord server" },
      { name: "limit", label: "Limit", type: "number", required: false, defaultValue: 50, placeholder: "Number of members (max 1000)", uiTab: "basic" },
      
      // Advanced Settings Tab
      { name: "nameFilter", label: "Name Filter", type: "text", required: false, uiTab: "advanced", description: "Filter members by username or nickname (case-insensitive)", placeholder: "e.g., admin, moderator, john" },
      { name: "roleFilter", label: "Role Filter", type: "select", dynamic: "discord_roles", required: false, uiTab: "advanced", description: "Only show members with this role", dependsOn: "guildId", placeholder: "Select a role (optional)" },
      { name: "sortBy", label: "Sort By", type: "select", required: false, uiTab: "advanced", description: "How to sort the members", options: [
        { value: "joined", label: "Join Date (newest first)" },
        { value: "joined_old", label: "Join Date (oldest first)" },
        { value: "name", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "username", label: "Username (A-Z)" },
        { value: "username_desc", label: "Username (Z-A)" }
      ], defaultValue: "joined" },
      { name: "includeBots", label: "Include Bots", type: "boolean", required: false, uiTab: "advanced", description: "Include bot users in results", defaultValue: false }
    ]
  },

  {
    type: "discord_action_assign_role",
    title: "Assign Role to Member",
    description: "Assign a role to a member in a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member", hasVariablePicker: true },
      { name: "roleId", label: "Role", type: "select", dynamic: "discord_roles", required: true, dependsOn: "guildId", placeholder: "Select a role" }
    ]
  },
  {
    type: "discord_action_remove_role",
    title: "Remove Role from Member",
    description: "Remove a role from a member in a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member", hasVariablePicker: true },
      { name: "roleId", label: "Role", type: "select", dynamic: "discord_roles", required: true, dependsOn: "guildId", placeholder: "Select a role" }
    ]
  },
  {
    type: "discord_action_kick_member",
    title: "Kick Member",
    description: "Kick a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member" },
      { name: "reason", label: "Reason", type: "text", required: false, placeholder: "Reason for kicking (optional)" }
    ]
  },
  {
    type: "discord_action_ban_member",
    title: "Ban Member",
    description: "Ban a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Member", type: "select", dynamic: "discord_members", required: true, dependsOn: "guildId", placeholder: "Select a member" },
      { name: "reason", label: "Reason", type: "text", required: false, placeholder: "Reason for banning (optional)" },
      { name: "deleteMessageSeconds", label: "Delete Messages", type: "select", required: false, placeholder: "Select message deletion option", options: [
        { value: "0", label: "Don't delete any messages" },
        { value: "3600", label: "Delete messages from last hour" },
        { value: "86400", label: "Delete messages from last day" },
        { value: "604800", label: "Delete messages from last week" },
        { value: "2592000", label: "Delete messages from last month" },
        { value: "7776000", label: "Delete messages from last 3 months" },
        { value: "31536000", label: "Delete all messages (1 year)" }
      ], defaultValue: "0" }
    ]
  },
  {
    type: "discord_action_unban_member",
    title: "Unban Member",
    description: "Unban a member from a Discord server.",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
    configSchema: [
      { name: "guildId", label: "Server", type: "select", dynamic: "discord_guilds", required: true, placeholder: "Select a Discord server" },
      { name: "userId", label: "Banned User", type: "select", dynamic: "discord_banned_users", required: true, dependsOn: "guildId", placeholder: "Select a banned user" }
    ]
  },
  // Resend Email Actions
  {
    type: "resend_send_email",
    title: "Send Email",
    description: "Send professional emails using the Resend service with high deliverability.",
    icon: Mail,
    category: "Communication",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      { 
        name: "to", 
        label: "To", 
        type: "text", 
        required: true, 
        placeholder: "recipient@example.com or {{email_variable}}", 
        description: "Email recipient(s). Use variables like {{email}} for dynamic content.",
        hasVariablePicker: true
      },
      { 
        name: "subject", 
        label: "Subject", 
        type: "text", 
        required: true, 
        placeholder: "Email subject or {{subject_variable}}", 
        description: "Email subject line. Supports variable substitution.",
        hasVariablePicker: true
      },
      { 
        name: "html", 
        label: "HTML Content", 
        type: "textarea", 
        required: false, 
        placeholder: "<h1>Hello {{name}}</h1><p>Your message here...</p>", 
        description: "HTML email content. Supports variable substitution.",
        hasVariablePicker: true
      },
      { 
        name: "text", 
        label: "Text Content", 
        type: "textarea", 
        required: false, 
        placeholder: "Hello {{name}}, your message here...", 
        description: "Plain text email content. Supports variable substitution.",
        hasVariablePicker: true
      },
      { 
        name: "from", 
        label: "From Address", 
        type: "text", 
        required: false, 
        placeholder: "ChainReact <noreply@chainreact.app>", 
        description: "Custom from address (optional). Must be verified domain."
      },
    ],
    outputSchema: [
      {
        name: "emailId",
        label: "Email ID",
        type: "string",
        description: "Unique identifier for the sent email",
        example: "re_abc123def456"
      },
      {
        name: "recipients",
        label: "Recipients",
        type: "array",
        description: "List of email recipients",
        example: ["user@example.com"]
      },
      {
        name: "subject",
        label: "Subject",
        type: "string",
        description: "Email subject that was sent",
        example: "Welcome to ChainReact"
      },
      {
        name: "sentAt",
        label: "Sent At",
        type: "string",
        description: "Timestamp when email was sent",
        example: "2024-01-15T10:30:00Z"
      },
    ],
    testable: true,
    testFunction: async (config: any) => ({
      emailId: "re_test123",
      recipients: [config.to || "test@example.com"],
      subject: config.subject || "Test Email",
      sentAt: new Date().toISOString(),
    })
  },
]
