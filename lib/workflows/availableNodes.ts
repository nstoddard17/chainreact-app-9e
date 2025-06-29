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
} from "lucide-react"

export interface ConfigField {
  name: string
  label: string
  type: "string" | "number" | "boolean" | "select" | "textarea" | "text" | "email" | "password" | "email-autocomplete" | "location-autocomplete" | "file" | "date" | "time" | "datetime" | "custom"
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[] | string[]
  dynamic?: "slack-channels" | "google-calendars" | "google-drive-folders" | "google-drive-files" | "gmail-recent-recipients" | "gmail-enhanced-recipients" | "gmail-contact-groups" | "gmail_messages" | "gmail_labels" | "gmail_recent_senders" | "google-sheets_spreadsheets" | "google-sheets_sheets" | "google-docs_documents" | "google-docs_templates" | "youtube_channels" | "youtube_videos" | "youtube_playlists" | "teams_chats" | "teams_teams" | "teams_channels" | "github_repositories" | "gitlab_projects" | "notion_databases" | "notion_pages" | "trello_boards" | "trello_lists" | "hubspot_companies" | "airtable_bases" | "gumroad_products" | "blackbaud_constituents"
  accept?: string // For file inputs, specify accepted file types
  maxSize?: number // For file inputs, specify max file size in bytes
  defaultValue?: string | number | boolean // Default value for the field
  [key: string]: any
}

export interface NodeComponent {
  type: string
  title: string
  description: string
  isTrigger?: boolean
  providerId?: string
  category: string
  configSchema?: ConfigField[]
  icon?: ComponentType<any>
  [key: string]: any
}

export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  // Generic Triggers
  {
    type: "webhook",
    title: "Webhook",
    description: "Receive HTTP requests",
    category: "Triggers",
    isTrigger: true,
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
  },

  // Generic Actions
  {
    type: "filter",
    title: "Filter",
    description: "Filter data based on conditions",
    icon: Filter,
    category: "Logic",
    isTrigger: false,
    configSchema: [
      { name: "condition", label: "Condition", type: "textarea", placeholder: "e.g., {{data.value}} > 100" },
    ],
  },
  {
    type: "delay",
    title: "Delay",
    description: "Pause the workflow for a specified amount of time",
    category: "Logic",
    isTrigger: false,
    configSchema: [
      { name: "duration", label: "Duration (seconds)", type: "number", placeholder: "e.g., 60" },
    ],
  },
  {
    type: "conditional",
    title: "Conditional Logic",
    description: "Branch workflow based on conditions",
    icon: GitBranch,
    category: "Logic",
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
    configSchema: [
      { name: "from", label: "From", type: "email", placeholder: "Optional: filter by sender" },
      { name: "subject", label: "Subject", type: "text", placeholder: "Optional: filter by subject" },
      { name: "hasAttachment", label: "Has Attachment", type: "select", options: ["any", "yes", "no"] },
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
    configSchema: [
      { name: "from", label: "From", type: "email", placeholder: "Optional: filter by sender" },
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
  },
  {
    type: "gmail_action_send_email",
    title: "Send Email",
    description: "Sends an email from your Gmail account.",
    isTrigger: false,
    providerId: "gmail",
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
    category: "Email",
    configSchema: [
      {
        name: "to",
        label: "To",
        type: "email-autocomplete",
        required: true,
        dynamic: "gmail-recent-recipients",
        placeholder: "Enter recipient email addresses...",
      },
      { name: "cc", label: "CC", type: "email-autocomplete", placeholder: "optional: cc@example.com", dynamic: "gmail-recent-recipients" },
      { name: "bcc", label: "BCC", type: "email-autocomplete", placeholder: "optional: bcc@example.com", dynamic: "gmail-recent-recipients" },
      { name: "subject", label: "Subject", type: "text", placeholder: "Your email subject", required: true },
      { name: "body", label: "Body", type: "textarea", placeholder: "Your email body", required: true },
      { 
        name: "attachments", 
        label: "Attachments", 
        type: "file", 
        placeholder: "Choose files to attach...",
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
        maxSize: 25 * 1024 * 1024 // 25MB limit (Gmail's attachment limit)
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
      },
      {
        name: "startTime",
        label: "Start Time",
        type: "time",
        required: true
      },
      {
        name: "endDate",
        label: "End Date",
        type: "date",
        required: true,
      },
      {
        name: "endTime",
        label: "End Time", 
        type: "time",
        required: true
      },
      { 
        name: "timeZone", 
        label: "Time Zone", 
        type: "select",
        defaultValue: "auto", // Will be set to user's timezone in ConfigurationModal
        options: [
          { value: "auto", label: "Auto-detect (recommended)" },
          { value: "America/New_York", label: "Eastern Time" },
          { value: "America/Chicago", label: "Central Time" },
          { value: "America/Denver", label: "Mountain Time" },
          { value: "America/Los_Angeles", label: "Pacific Time" },
          { value: "UTC", label: "UTC" },
          { value: "Europe/London", label: "London" },
          { value: "Europe/Paris", label: "Paris" },
          { value: "Europe/Berlin", label: "Berlin" },
          { value: "Asia/Tokyo", label: "Tokyo" },
          { value: "Asia/Shanghai", label: "Shanghai" },
          { value: "Asia/Dubai", label: "Dubai" },
          { value: "Australia/Sydney", label: "Sydney" }
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
        defaultValue: "default",
        options: [
          { value: "default", label: "Default visibility" },
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
          { value: "opaque", label: "Busy" },
          { value: "transparent", label: "Free" }
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
          { value: "0", label: "None" },
          { value: "5", label: "5 minutes before" },
          { value: "10", label: "10 minutes before" },
          { value: "15", label: "15 minutes before" },
          { value: "30", label: "30 minutes before" },
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
    title: "Create File",
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
    title: "Upload File (Google Drive)",
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
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
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
        defaultValue: "add",
        options: [
          { value: "add", label: "Add new row" },
          { value: "update", label: "Update existing row" },
          { value: "delete", label: "Delete row" }
        ],
        description: "What operation to perform on the sheet"
      },
      {
        name: "columnMappings",
        label: "Column Mappings",
        type: "custom",
        required: true,
        description: "Map your data to sheet columns"
      },
      {
        name: "selectedRow",
        label: "Select Row",
        type: "custom",
        required: false,
        description: "Select the row to update or delete"
      }
    ],
  },



  // Google Sheets Read Action
  {
    type: "google_sheets_action_read_data",
    title: "Read Data from Sheet",
    description: "Reads data from a Google Sheet with filtering and formatting options.",
    isTrigger: false,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
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
        name: "selectedRows",
        label: "Selected Rows",
        type: "custom",
        required: false,
        description: "Rows selected from the data preview",
        dependsOn: "readMode"
      },
      {
        name: "selectedCells",
        label: "Selected Cells",
        type: "custom",
        required: false,
        description: "Individual cells selected from the data preview",
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
          { value: "array", label: "Array of Arrays" },
          { value: "csv", label: "CSV String" }
        ],
        description: "Choose how to format the output data. Objects format is easiest to use in subsequent actions."
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
        name: "sheetName",
        label: "First Sheet Name",
        type: "text",
        required: false,
        placeholder: "Sheet1",
        description: "Name for the first sheet (defaults to 'Sheet1')"
      },
      {
        name: "columnCount",
        label: "Number of Columns",
        type: "number",
        required: true,
        placeholder: "e.g., 5",
        description: "How many columns do you want in your spreadsheet?"
      },
      {
        name: "addHeaders",
        label: "Add Headers",
        type: "boolean",
        defaultValue: false,
        description: "Add column names as the first row of the spreadsheet"
      },
      {
        name: "columnNames",
        label: "Column Names",
        type: "custom",
        required: false,
        description: "Define the names for each column"
      },
      {
        name: "spreadsheetData",
        label: "Spreadsheet Data",
        type: "custom",
        required: false,
        description: "Add rows of data to your spreadsheet"
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
        description: "The time zone of the spreadsheet"
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
      },
      { name: "text", label: "Message Text", type: "textarea" },
    ],
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
  },
  {
    type: "notion_action_append_to_page",
    title: "Append to Page (Notion)",
    description: "Append content to an existing page",
    icon: Plus,
    providerId: "notion",
    category: "Productivity",
    isTrigger: false,
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
      { name: "userEmail", label: "User Email", type: "email", required: true, placeholder: "Enter user's email address" },
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
      { name: "attendees", label: "Attendees", type: "text", required: false, placeholder: "Comma-separated email addresses" },
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
    description: "Triggers when a new message is posted in a channel",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
  },
  {
    type: "teams_trigger_new_message_in_chat",
    title: "New Message in Chat",
    description: "Triggers when a new message is posted in a chat",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
  },
  {
    type: "teams_trigger_user_joins_team",
    title: "User Joins Team",
    description: "Triggers when a new user joins a team",
    icon: Users,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
  },

  // Twitter (X)
  {
    type: "twitter_trigger_new_tweet",
    title: "New Tweet by User",
    description: "Triggers when a specific user posts a tweet",
    icon: MessageSquare,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
  },
  {
    type: "twitter_action_post_tweet",
    title: "Post a Tweet",
    description: "Post a new tweet to your account",
    icon: PenSquare,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
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
      { name: "videoFile", label: "Video File", type: "file", required: true, accept: ".mp4,.mov,.avi,.wmv,.flv,.mkv", maxSize: 512 * 1024 * 1024, placeholder: "Select a video file to upload" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Enter video title" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Enter video description" },
      { name: "privacyStatus", label: "Privacy Status", type: "select", required: true, defaultValue: "private", options: [ { value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Private" } ] },
      { name: "tags", label: "Tags", type: "text", required: false, placeholder: "Comma-separated tags (optional)" },
      { name: "playlistId", label: "Add to Playlist", type: "select", dynamic: "youtube_playlists", required: false, placeholder: "Select a playlist (optional)" }
    ]
  },
  {
    type: "youtube_action_list_videos",
    title: "List My Videos (YouTube)",
    description: "List all videos from your YouTube channel",
    icon: Video,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    category: "Social",
    isTrigger: false,
    configSchema: []
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
    type: "gmail_action_add_label",
    title: "Add Label (Gmail)",
    description: "Add a label to an email",
    icon: Edit,
    providerId: "gmail",
    category: "Email",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
    configSchema: [
      { 
        name: "messageId", 
        label: "Email", 
        type: "select", 
        dynamic: "gmail_messages",
        required: true,
        placeholder: "Select an email from your Gmail account",
        description: "Choose from your recent emails"
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
    ],
  },
  {
    type: "gmail_action_search_email",
    title: "Search Email (Gmail)",
    description: "Search for a specific email",
    icon: Edit,
    providerId: "gmail",
    category: "Email",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    configSchema: [
      { 
        name: "emailAddress", 
        label: "Email Address", 
        type: "email-autocomplete", 
        dynamic: "gmail-recent-recipients",
        required: false,
        placeholder: "Enter email addresses...",
        description: "Choose from recent recipients or type custom email addresses"
      },
      { 
        name: "quantity", 
        label: "Number of Emails", 
        type: "select",
        required: false,
        placeholder: "Select how many emails to fetch",
        description: "Choose how many recent emails to fetch from this sender",
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
        name: "messageId", 
        label: "Specific Email", 
        type: "select", 
        dynamic: "gmail_messages",
        required: false,
        placeholder: "Select a specific email (optional)",
        description: "Choose a specific email from your Gmail account"
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
      { name: "messageId", label: "Message ID", type: "text" },
      { name: "folderName", label: "Folder Name", type: "text" },
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
    configSchema: [{ name: "messageId", label: "Message ID", type: "text" }],
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
    configSchema: [{ name: "query", label: "Search Query", type: "text" }],
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
    configSchema: [
      { name: "channelId", label: "Channel ID", type: "text" },
      { name: "blocks", label: "Blocks (JSON)", type: "textarea" },
    ],
  },
  {
    type: "slack_action_add_reaction",
    title: "Add Reaction (Slack)",
    description: "Add a reaction to a message",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["reactions:write"],
    configSchema: [
      { name: "channelId", label: "Channel ID", type: "text" },
      { name: "timestamp", label: "Message Timestamp", type: "text" },
      { name: "reaction", label: "Reaction", type: "text" },
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
    configSchema: [{ name: "command", label: "Command", type: "text" }],
  },
  {
    type: "discord_action_post_interactive",
    title: "Post Interactive Blocks (Discord)",
    description: "Post interactive blocks and buttons",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["bot"],
    configSchema: [
      { name: "channelId", label: "Channel ID", type: "text" },
      { name: "embeds", label: "Embeds (JSON)", type: "textarea" },
    ],
  },
  {
    type: "discord_action_add_reaction",
    title: "Add Reaction (Discord)",
    description: "Add a reaction to a message",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: false,
    requiredScopes: ["bot"],
    configSchema: [
      { name: "channelId", label: "Channel ID", type: "text" },
      { name: "messageId", label: "Message ID", type: "text" },
      { name: "emoji", label: "Emoji", type: "text" },
    ],
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
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
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
    type: "google_docs_action_read_document",
    title: "Read Document (Google Docs)",
    description: "Read content from an existing Google Document",
    icon: FileText,
    providerId: "google-docs",
    category: "Productivity",
    isTrigger: false,
    requiredScopes: ["https://www.googleapis.com/auth/documents.readonly"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_documents",
        required: true,
        placeholder: "Select a document from your Google Docs",
        description: "Choose from your connected Google Docs documents"
      },
      {
        name: "includeFormatting",
        label: "Include Formatting",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Whether to include text formatting information"
      },
      {
        name: "includeComments",
        label: "Include Comments",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Whether to include document comments"
      },
      {
        name: "outputFormat",
        label: "Output Format",
        type: "select",
        required: false,
        defaultValue: "text",
        options: [
          { value: "text", label: "Plain Text" },
          { value: "html", label: "HTML" },
          { value: "json", label: "JSON (with formatting)" }
        ],
        description: "How to format the output content"
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
    requiredScopes: ["https://www.googleapis.com/auth/documents"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_documents",
        required: true,
        placeholder: "Select a document from your Google Docs",
        description: "Choose from your connected Google Docs documents"
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
    requiredScopes: ["https://www.googleapis.com/auth/drive"],
    configSchema: [
      {
        name: "documentId",
        label: "Document",
        type: "select",
        dynamic: "google-docs_documents",
        required: true,
        placeholder: "Select a document from your Google Docs",
        description: "Choose from your connected Google Docs documents"
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
      { name: "documentId", label: "Document", type: "select", dynamic: "google-docs_documents", required: true, placeholder: "Select a document to export" },
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
      { name: "pageId", label: "Page ID", type: "text", required: true, placeholder: "Enter Facebook page ID" },
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
      { name: "pageId", label: "Page ID", type: "text", required: true, placeholder: "Enter Facebook page ID" },
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
      ] }
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
    description: "Create a new database in Notion",
    icon: Database,
    providerId: "notion",
    requiredScopes: ["content.write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "parentPageId", label: "Parent Page ID", type: "text", required: true, placeholder: "Enter parent page ID" },
      { name: "title", label: "Database Title", type: "text", required: true, placeholder: "Enter database title" },
      { name: "properties", label: "Properties (JSON)", type: "textarea", required: false, placeholder: '{"Name": {"title": {}}, "Status": {"select": {"options": [{"name": "Not Started"}, {"name": "In Progress"}, {"name": "Done"}]}}}' }
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
      { name: "pageId", label: "Page ID", type: "text", required: true, placeholder: "Enter page ID" },
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
        { value: "public", label: "Public" }
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
      { name: "boardId", label: "Board ID", type: "text", required: true, placeholder: "Enter board ID" },
      { name: "name", label: "List Name", type: "text", required: true, placeholder: "Enter list name" },
      { name: "position", label: "Position", type: "select", required: false, defaultValue: "bottom", options: [
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" }
      ] }
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
      { name: "cardId", label: "Card ID", type: "text", required: true, placeholder: "Enter card ID" },
      { name: "listId", label: "Target List ID", type: "text", required: true, placeholder: "Enter target list ID" },
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
      { name: "pipeline", label: "Pipeline", type: "text", required: false, placeholder: "default" },
      { name: "stage", label: "Stage", type: "text", required: false, placeholder: "appointmentscheduled" },
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
      { name: "contactId", label: "Contact ID", type: "text", required: true, placeholder: "Enter contact ID" },
      { name: "listId", label: "List ID", type: "text", required: true, placeholder: "Enter list ID" }
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
      { name: "baseId", label: "Base ID", type: "text", required: true, placeholder: "Enter base ID" },
      { name: "tableName", label: "Table Name", type: "text", required: true, placeholder: "Enter table name" },
      { name: "recordId", label: "Record ID", type: "text", required: true, placeholder: "Enter record ID" },
      { name: "fields", label: "Fields (JSON)", type: "textarea", required: true, placeholder: '{"Name": "Updated Name", "Status": "Complete"}' }
    ]
  },
  {
    type: "airtable_action_delete_record",
    title: "Delete Record (Airtable)",
    description: "Delete a record from Airtable",
    icon: Trash2,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { name: "baseId", label: "Base ID", type: "text", required: true, placeholder: "Enter base ID" },
      { name: "tableName", label: "Table Name", type: "text", required: true, placeholder: "Enter table name" },
      { name: "recordId", label: "Record ID", type: "text", required: true, placeholder: "Enter record ID" }
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
    configSchema: [
      { name: "baseId", label: "Base ID", type: "text", required: true, placeholder: "Enter base ID" },
      { name: "tableName", label: "Table Name", type: "text", required: true, placeholder: "Enter table name" },
      { name: "maxRecords", label: "Max Records", type: "number", required: false, defaultValue: 100, placeholder: "100" },
      { name: "filterByFormula", label: "Filter Formula", type: "text", required: false, placeholder: "{Status} = 'Active'" }
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
      { name: "parentFolderId", label: "Parent Folder ID", type: "text", required: true, placeholder: "Enter folder ID" },
      { name: "fileName", label: "File Name", type: "text", required: true, placeholder: "Enter file name" },
      { name: "fileContent", label: "File Content", type: "textarea", required: true, placeholder: "Enter file content" }
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
      { name: "to", label: "To", type: "text", required: true, placeholder: "recipient@example.com" },
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Email subject" },
      { name: "body", label: "Body", type: "textarea", required: true, placeholder: "Email body" },
      { name: "cc", label: "CC", type: "text", required: false, placeholder: "cc@example.com" },
      { name: "bcc", label: "BCC", type: "text", required: false, placeholder: "bcc@example.com" },
      { name: "isHtml", label: "HTML Body", type: "boolean", required: false, defaultValue: false }
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
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Event subject" },
      { name: "startTime", label: "Start Time", type: "datetime", required: true },
      { name: "endTime", label: "End Time", type: "datetime", required: true },
      { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Event description" },
      { name: "attendees", label: "Attendees", type: "text", required: false, placeholder: "attendee1@example.com,attendee2@example.com" },
      { name: "location", label: "Location", type: "text", required: false, placeholder: "Meeting location" }
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
      { name: "sectionId", label: "Section ID", type: "text", required: true, placeholder: "Enter section ID" },
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
      { name: "notebookId", label: "Notebook ID", type: "text", required: true, placeholder: "Enter notebook ID" },
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
      { name: "pageId", label: "Page ID", type: "text", required: true, placeholder: "Enter page ID" },
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
