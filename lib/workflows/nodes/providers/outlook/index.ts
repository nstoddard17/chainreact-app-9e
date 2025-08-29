import { NodeComponent } from "../../types"
import { 
  Mail, 
  Send, 
  Calendar, 
  UserPlus, 
  Move, 
  Check, 
  X, 
  Reply, 
  Forward, 
  MailOpen, 
  Users,
  Edit,
  Archive,
  Search,
  FolderOpen
} from "lucide-react"

// Microsoft Outlook Triggers
const outlookTriggerNewEmail: NodeComponent = {
  type: "microsoft-outlook_trigger_new_email",
  title: "New email received",
  description: "Triggers when a new email is received",
  icon: Mail,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Mail.Read"],
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
    { name: "reminderMinutesBeforeStart", label: "Reminder (minutes before)", type: "select", required: false, defaultValue: "15", options: [
      { value: "0", label: "At start time" },
      { value: "5", label: "5 minutes" },
      { value: "10", label: "10 minutes" },
      { value: "15", label: "15 minutes" },
      { value: "30", label: "30 minutes" },
      { value: "60", label: "1 hour" },
      { value: "120", label: "2 hours" },
      { value: "1440", label: "1 day" },
      { value: "2880", label: "2 days" },
      { value: "10080", label: "1 week" }
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

const outlookActionCreateContact: NodeComponent = {
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
}

const outlookActionMoveEmail: NodeComponent = {
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
}

const outlookActionMarkAsRead: NodeComponent = {
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
}

const outlookActionMarkAsUnread: NodeComponent = {
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
}

const outlookActionReplyToEmail: NodeComponent = {
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
}

const outlookActionForwardEmail: NodeComponent = {
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
}

const outlookActionFetchEmails: NodeComponent = {
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
}

const outlookActionGetContacts: NodeComponent = {
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
}

const outlookActionGetCalendarEvents: NodeComponent = {
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
}

const outlookActionAddFolder: NodeComponent = {
  type: "microsoft-outlook_action_add_folder",
  title: "Add to Folder",
  description: "Move an email to a specific folder",
  icon: FolderOpen,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" },
    { name: "folderId", label: "Destination Folder", type: "select", required: true, dynamic: "outlook_folders", placeholder: "Select a folder" },
  ],
}

const outlookActionArchiveEmail: NodeComponent = {
  type: "microsoft-outlook_action_archive_email",
  title: "Archive Email",
  description: "Archive an email",
  icon: Archive,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "messageId", label: "Message", type: "select", required: true, dynamic: "outlook_messages", placeholder: "Select a message" }
  ],
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
  
  // Actions (14)
  outlookActionSendEmail,
  outlookActionCreateCalendarEvent,
  outlookActionCreateContact,
  outlookActionMoveEmail,
  outlookActionMarkAsRead,
  outlookActionMarkAsUnread,
  outlookActionReplyToEmail,
  outlookActionForwardEmail,
  outlookActionFetchEmails,
  outlookActionGetContacts,
  outlookActionGetCalendarEvents,
  outlookActionAddFolder,
  outlookActionArchiveEmail,
  outlookActionSearchEmail,
]