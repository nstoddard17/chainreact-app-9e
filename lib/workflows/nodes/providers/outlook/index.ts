import { NodeComponent } from "../../types"
import {
  Mail,
  Send,
  Calendar,
  Search
} from "lucide-react"

// Microsoft Outlook Triggers
const outlookTriggerNewEmail: NodeComponent = {
  type: "microsoft-outlook_trigger_new_email",
  title: "New Email",
  description: "Triggers when a new email is received in Outlook",
  icon: Mail,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Mail.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "from",
      label: "From",
      type: "email-autocomplete",
      dynamic: "outlook-enhanced-recipients",
      required: true,
      loadOnMount: true,
      placeholder: "Enter sender email address",
      description: "Filter emails by sender address"
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
      name: "subject",
      label: "Subject",
      type: "text",
      required: false,
      placeholder: "Optional: filter by subject",
      description: "Filter emails by subject line"
    },
    {
      name: "hasAttachment",
      label: "Has Attachment",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any" },
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ],
      defaultValue: "any",
      description: "Filter emails based on attachment presence"
    },
    {
      name: "folder",
      label: "Folder",
      type: "select",
      dynamic: "outlook_folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select folder (default: Inbox)",
      description: "Monitor specific folder for new emails"
    },
    {
      name: "importance",
      label: "Importance",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any" },
        { value: "high", label: "High" },
        { value: "normal", label: "Normal" },
        { value: "low", label: "Low" }
      ],
      defaultValue: "any",
      description: "Filter emails by importance level"
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
      name: "conversationId",
      label: "Conversation ID",
      type: "string",
      description: "The ID of the email conversation/thread"
    },
    {
      name: "from",
      label: "From",
      type: "object",
      description: "The sender's information (name and email)"
    },
    {
      name: "to",
      label: "To",
      type: "array",
      description: "The recipients' information"
    },
    {
      name: "cc",
      label: "CC",
      type: "array",
      description: "The CC recipients' information"
    },
    {
      name: "bcc",
      label: "BCC",
      type: "array",
      description: "The BCC recipients' information"
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
      description: "The full body of the email (HTML)"
    },
    {
      name: "bodyPreview",
      label: "Body Preview",
      type: "string",
      description: "A preview/snippet of the email's content"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "array",
      description: "An array of attachment objects"
    },
    {
      name: "receivedDateTime",
      label: "Received At",
      type: "string",
      description: "The timestamp when the email was received"
    },
    {
      name: "importance",
      label: "Importance",
      type: "string",
      description: "The importance level of the email"
    },
    {
      name: "isRead",
      label: "Is Read",
      type: "boolean",
      description: "Whether the email has been read"
    },
    {
      name: "hasAttachments",
      label: "Has Attachments",
      type: "boolean",
      description: "Whether the email has attachments"
    },
    {
      name: "folder",
      label: "Folder",
      type: "string",
      description: "The folder where the email is located"
    }
  ]
}

const outlookTriggerEmailSent: NodeComponent = {
  type: "microsoft-outlook_trigger_email_sent",
  title: "Email sent",
  description: "Triggers when an email is sent",
  icon: Send,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Mail.Send"],
}

// Microsoft Outlook Actions
const outlookActionSendEmail: NodeComponent = {
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
}

const outlookActionCreateCalendarEvent: NodeComponent = {
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
    { name: "calendarId", label: "Calendar", type: "combobox", required: true, creatable: true, dynamic: true, loadOnMount: true, placeholder: "Select a calendar or type to create new" },

    // General Section
    { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Event subject" },
    { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Event description" },

    // Simple Date/Time Fields
    { name: "eventDate", label: "Date", type: "select", required: true, defaultValue: "today", options: [
      { value: "today", label: "Today" },
      { value: "tomorrow", label: "Tomorrow" },
      { value: "in_3_days", label: "In 3 days" },
      { value: "in_1_week", label: "In 1 week" },
      { value: "in_2_weeks", label: "In 2 weeks" },
      { value: "custom_days", label: "In X days..." },
      { value: "next_weekday", label: "Next specific weekday..." },
      { value: "specific", label: "Pick a specific date..." }
    ]},
    { name: "customDays", label: "Number of days from now", type: "number", required: false, conditional: { field: "eventDate", value: "custom_days" }, placeholder: "Enter number of days (e.g., 5)", min: 1, max: 365 },
    { name: "nextWeekday", label: "Select weekday", type: "select", required: false, conditional: { field: "eventDate", value: "next_weekday" }, options: [
      { value: "monday", label: "Next Monday" },
      { value: "tuesday", label: "Next Tuesday" },
      { value: "wednesday", label: "Next Wednesday" },
      { value: "thursday", label: "Next Thursday" },
      { value: "friday", label: "Next Friday" },
      { value: "saturday", label: "Next Saturday" },
      { value: "sunday", label: "Next Sunday" }
    ]},
    { name: "specificDate", label: "Specific Date", type: "date", required: false, conditional: { field: "eventDate", value: "specific" } },

    { name: "eventTime", label: "Start Time", type: "select", required: true, defaultValue: "09:00", options: [
      { value: "current", label: "Current Time" },
      { value: "08:00", label: "8:00 AM" },
      { value: "09:00", label: "9:00 AM" },
      { value: "10:00", label: "10:00 AM" },
      { value: "11:00", label: "11:00 AM" },
      { value: "12:00", label: "12:00 PM" },
      { value: "13:00", label: "1:00 PM" },
      { value: "14:00", label: "2:00 PM" },
      { value: "15:00", label: "3:00 PM" },
      { value: "16:00", label: "4:00 PM" },
      { value: "17:00", label: "5:00 PM" },
      { value: "18:00", label: "6:00 PM" },
      { value: "19:00", label: "7:00 PM" },
      { value: "20:00", label: "8:00 PM" },
      { value: "custom", label: "Custom time..." }
    ]},
    { name: "customTime", label: "Custom Time", type: "time", required: false, conditional: { field: "eventTime", value: "custom" } },

    { name: "duration", label: "Duration", type: "select", required: true, defaultValue: "60", options: [
      { value: "allday", label: "All Day" },
      { value: "30", label: "30 minutes" },
      { value: "60", label: "1 hour" },
      { value: "90", label: "1.5 hours" },
      { value: "120", label: "2 hours" },
      { value: "180", label: "3 hours" },
      { value: "240", label: "4 hours" },
      { value: "480", label: "All Day (8 hours)" },
      { value: "custom", label: "Custom end time..." }
    ]},
    { name: "customEndDate", label: "End Date", type: "date", required: false, conditional: { field: "duration", value: "custom" } },
    { name: "customEndTime", label: "End Time", type: "time", required: false, conditional: { field: "duration", value: "custom" } },

    // Time Zone (applies to both modes)
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

    // Other Fields
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
      { value: "RRULE:FREQ=YEARLY", label: "Yearly" },
      { value: "custom", label: "Custom" }
    ]},
    { name: "customRecurrence", label: "Custom Recurrence", type: "text", required: false, placeholder: "Enter custom RRULE", conditional: { field: "recurrence", value: "custom" } },
    { name: "repeatUntil", label: "Repeat Until", type: "date", required: false, placeholder: "End date for recurring events" },
    
    // Meeting Options Section
    { name: "isOnlineMeeting", label: "Online Meeting", type: "boolean", required: false, defaultValue: false },
    { name: "onlineMeetingProvider", label: "Meeting Provider", type: "select", required: false, defaultValue: "teamsForBusiness", options: [
      { value: "teamsForBusiness", label: "Microsoft Teams" },
      { value: "skypeForBusiness", label: "Skype for Business" },
      { value: "skypeForConsumer", label: "Skype" }
    ], showWhen: { isOnlineMeeting: true } },
    
    // Reminder Section
    { name: "reminderMinutesBeforeStart", label: "Reminder", type: "select", required: false, defaultValue: "15", options: [
      { value: "none", label: "No reminder" },
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
    
    // Appearance and Options Section
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
}

const outlookActionGetEmails: NodeComponent = {
  type: "microsoft-outlook_action_fetch_emails",
  title: "Get Emails",
  description: "Find emails in Outlook matching specific search criteria",
  icon: Search,
  providerId: "microsoft-outlook",
  requiredScopes: ["Mail.Read"],
  category: "Communication",
  isTrigger: false,
  producesOutput: true,
  configSchema: [
    {
      name: "folderId",
      label: "Folder / Label",
      type: "select",
      dynamic: "outlook_folders",
      required: true,
      placeholder: "Select folders or labels",
      description: "Choose which Outlook folders to search in"
    },
    {
      name: "query",
      label: "Search Query",
      type: "text",
      required: true,
      placeholder: "e.g., from:bob@example.com hasAttachments:true",
      description: "Use Outlook search operators like 'from:', 'to:', 'subject:', 'hasAttachments:true', etc."
    },
    {
      name: "maxResults",
      label: "Max Messages to Fetch",
      type: "number",
      required: false,
      placeholder: "10",
      description: "Maximum number of messages to retrieve (between 1-15)",
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
      name: "includeDeleted",
      label: "Include Deleted Items",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Include messages from Deleted Items folder"
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

const outlookActionGetCalendarEvents: NodeComponent = {
  type: "microsoft-outlook_action_get_calendar_events",
  title: "Get Calendar Events",
  description: "Retrieve calendar events from Outlook",
  icon: Calendar,
  providerId: "microsoft-outlook",
  requiredScopes: ["Calendars.Read"],
  category: "Communication",
  isTrigger: false,
  producesOutput: true,
  configSchema: [
    { name: "calendarId", label: "Calendar", type: "select", required: false, dynamic: true, loadOnMount: true, placeholder: "Select a calendar (uses default if not specified)" },
    { name: "startDate", label: "Start Date", type: "date", required: false, placeholder: "Start date for events" },
    { name: "endDate", label: "End Date", type: "date", required: false, placeholder: "End date for events" },
    { name: "limit", label: "Number of Events", type: "select", required: false, defaultValue: "25", options: [
      { value: "10", label: "10 events" },
      { value: "25", label: "25 events" },
      { value: "50", label: "50 events" },
      { value: "100", label: "100 events" }
    ]},
  ]
}

const outlookActionSearchEmail: NodeComponent = {
  type: "microsoft-outlook_action_search_email",
  title: "Search Email",
  description: "Search for a specific email",
  icon: Search,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.Read"],
  configSchema: [
    { name: "query", label: "Search Query", type: "text", required: true, placeholder: "Enter search terms (e.g., from:john@example.com subject:meeting)" },
    { name: "folderId", label: "Search in Folder", type: "select", required: false, dynamic: "outlook_folders", placeholder: "Select a folder (optional, searches all folders if not specified)" },
  ],
}

// Export all Microsoft Outlook nodes
export const outlookNodes: NodeComponent[] = [
  // Triggers (2)
  outlookTriggerNewEmail,
  outlookTriggerEmailSent,

  // Actions (2) - Send Email temporarily hidden due to delivery issues
  // outlookActionSendEmail, // Hidden until email delivery configuration is resolved
  outlookActionCreateCalendarEvent,
  outlookActionGetEmails,
]