import { NodeComponent } from "../../types"
import {
  Mail,
  Send,
  Calendar,
  Search,
  FileText,
  Trash2,
  UserPlus,
  Edit,
  Clock,
  FolderInput,
  Paperclip,
  Flag,
  Users,
  MailPlus
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
      type: "select",
      dynamic: "outlook-enhanced-recipients",
      required: false,
      loadOnMount: true,
      placeholder: "Leave blank for any sender",
      description: "Filter by sender email address. Shows recent senders and your contacts.",
      tooltip: "Leave blank to trigger on emails from ANY sender"
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
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "to",
      label: "To",
      type: "email-autocomplete",
      dynamic: "outlook-enhanced-recipients",
      required: true,
      loadOnMount: true,
      placeholder: "Enter recipient email address",
      description: "Filter sent emails by recipient address"
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
      description: "Filter sent emails by subject line"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Email ID",
      type: "string",
      description: "The unique ID of the sent email"
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
      description: "The subject of the sent email"
    },
    {
      name: "body",
      label: "Body",
      type: "string",
      description: "The full body of the sent email (HTML)"
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
      name: "sentDateTime",
      label: "Sent At",
      type: "string",
      description: "The timestamp when the email was sent"
    },
    {
      name: "importance",
      label: "Importance",
      type: "string",
      description: "The importance level of the email"
    },
    {
      name: "hasAttachments",
      label: "Has Attachments",
      type: "boolean",
      description: "Whether the email has attachments"
    }
  ]
}

const outlookTriggerEmailFlagged: NodeComponent = {
  type: "microsoft-outlook_trigger_email_flagged",
  title: "Email Flagged",
  description: "Triggers when an email is flagged/starred",
  icon: Flag,
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
      name: "folder",
      label: "Folder",
      type: "select",
      dynamic: "outlook_folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select folder (default: All folders)",
      description: "Monitor specific folder for flagged emails"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Email ID",
      type: "string",
      description: "The unique ID of the flagged email"
    },
    {
      name: "from",
      label: "From",
      type: "object",
      description: "The sender's information (name and email)"
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
      name: "receivedDateTime",
      label: "Received At",
      type: "string",
      description: "The timestamp when the email was received"
    },
    {
      name: "flagStatus",
      label: "Flag Status",
      type: "string",
      description: "The flag status (flagged, complete, notFlagged)"
    }
  ]
}

const outlookTriggerNewAttachment: NodeComponent = {
  type: "microsoft-outlook_trigger_new_attachment",
  title: "New Attachment",
  description: "Triggers when a new email with attachments is received",
  icon: Paperclip,
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
      name: "folder",
      label: "Folder",
      type: "select",
      dynamic: "outlook_folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select folder (default: Inbox)",
      description: "Monitor specific folder for emails with attachments"
    },
    {
      name: "fileExtension",
      label: "File Extension Filter",
      type: "text",
      required: false,
      placeholder: "e.g., pdf, docx, xlsx (comma-separated)",
      description: "Filter by specific file extensions"
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
      name: "from",
      label: "From",
      type: "object",
      description: "The sender's information (name and email)"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject of the email"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "array",
      description: "An array of attachment objects with name, size, and contentType"
    },
    {
      name: "receivedDateTime",
      label: "Received At",
      type: "string",
      description: "The timestamp when the email was received"
    }
  ]
}

const outlookTriggerNewCalendarEvent: NodeComponent = {
  type: "microsoft-outlook_trigger_new_calendar_event",
  title: "New Calendar Event",
  description: "Triggers when a new calendar event is created",
  icon: Calendar,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Calendars.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "calendarId",
      label: "Calendar",
      type: "select",
      dynamic: true,
      loadOnMount: true,
      required: false,
      placeholder: "Select calendar (default: primary calendar)",
      description: "Monitor specific calendar for new events"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Event ID",
      type: "string",
      description: "The unique ID of the calendar event"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject/title of the event"
    },
    {
      name: "body",
      label: "Body",
      type: "string",
      description: "Event description/body content"
    },
    {
      name: "start",
      label: "Start Time",
      type: "object",
      description: "Event start time (dateTime and timeZone)"
    },
    {
      name: "end",
      label: "End Time",
      type: "object",
      description: "Event end time (dateTime and timeZone)"
    },
    {
      name: "location",
      label: "Location",
      type: "string",
      description: "Event location"
    },
    {
      name: "attendees",
      label: "Attendees",
      type: "array",
      description: "List of event attendees"
    },
    {
      name: "organizer",
      label: "Organizer",
      type: "object",
      description: "Event organizer information"
    },
    {
      name: "isOnlineMeeting",
      label: "Is Online Meeting",
      type: "boolean",
      description: "Whether this is an online meeting"
    },
    {
      name: "onlineMeetingUrl",
      label: "Meeting URL",
      type: "string",
      description: "Online meeting URL if applicable"
    },
    {
      name: "createdDateTime",
      label: "Created At",
      type: "string",
      description: "When the event was created"
    }
  ]
}

const outlookTriggerUpdatedCalendarEvent: NodeComponent = {
  type: "microsoft-outlook_trigger_updated_calendar_event",
  title: "Updated Calendar Event",
  description: "Triggers when a calendar event is updated",
  icon: Edit,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Calendars.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "calendarId",
      label: "Calendar",
      type: "select",
      dynamic: true,
      loadOnMount: true,
      required: false,
      placeholder: "Select calendar (default: primary calendar)",
      description: "Monitor specific calendar for event updates"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Event ID",
      type: "string",
      description: "The unique ID of the calendar event"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject/title of the event"
    },
    {
      name: "body",
      label: "Body",
      type: "string",
      description: "Event description/body content"
    },
    {
      name: "start",
      label: "Start Time",
      type: "object",
      description: "Event start time (dateTime and timeZone)"
    },
    {
      name: "end",
      label: "End Time",
      type: "object",
      description: "Event end time (dateTime and timeZone)"
    },
    {
      name: "location",
      label: "Location",
      type: "string",
      description: "Event location"
    },
    {
      name: "attendees",
      label: "Attendees",
      type: "array",
      description: "List of event attendees"
    },
    {
      name: "lastModifiedDateTime",
      label: "Last Modified",
      type: "string",
      description: "When the event was last updated"
    }
  ]
}

const outlookTriggerDeletedCalendarEvent: NodeComponent = {
  type: "microsoft-outlook_trigger_deleted_calendar_event",
  title: "Deleted Calendar Event",
  description: "Triggers when a calendar event is cancelled or deleted",
  icon: Trash2,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Calendars.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "calendarId",
      label: "Calendar",
      type: "select",
      dynamic: true,
      loadOnMount: true,
      required: false,
      placeholder: "Select calendar (default: primary calendar)",
      description: "Monitor specific calendar for deleted events"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Event ID",
      type: "string",
      description: "The unique ID of the deleted event"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject/title of the deleted event"
    },
    {
      name: "start",
      label: "Start Time",
      type: "object",
      description: "Original event start time"
    },
    {
      name: "end",
      label: "End Time",
      type: "object",
      description: "Original event end time"
    },
    {
      name: "isCancelled",
      label: "Is Cancelled",
      type: "boolean",
      description: "Whether the event was cancelled vs permanently deleted"
    }
  ]
}

const outlookTriggerCalendarEventStart: NodeComponent = {
  type: "microsoft-outlook_trigger_calendar_event_start",
  title: "Calendar Event Start",
  description: "Triggers before a calendar event starts (for reminders/notifications)",
  icon: Clock,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Calendars.Read"],
  producesOutput: true,
  supportsWebhook: false,
  configSchema: [
    {
      name: "calendarId",
      label: "Calendar",
      type: "select",
      dynamic: true,
      loadOnMount: true,
      required: false,
      placeholder: "Select calendar (default: primary calendar)",
      description: "Monitor specific calendar for upcoming events"
    },
    {
      name: "minutesBefore",
      label: "Minutes Before Start",
      type: "select",
      required: true,
      defaultValue: "15",
      options: [
        { value: "5", label: "5 minutes before" },
        { value: "10", label: "10 minutes before" },
        { value: "15", label: "15 minutes before" },
        { value: "30", label: "30 minutes before" },
        { value: "60", label: "1 hour before" },
        { value: "120", label: "2 hours before" },
        { value: "1440", label: "1 day before" }
      ],
      description: "How far in advance to trigger before event starts"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Event ID",
      type: "string",
      description: "The unique ID of the upcoming event"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject/title of the event"
    },
    {
      name: "start",
      label: "Start Time",
      type: "object",
      description: "Event start time (dateTime and timeZone)"
    },
    {
      name: "end",
      label: "End Time",
      type: "object",
      description: "Event end time (dateTime and timeZone)"
    },
    {
      name: "location",
      label: "Location",
      type: "string",
      description: "Event location"
    },
    {
      name: "attendees",
      label: "Attendees",
      type: "array",
      description: "List of event attendees"
    },
    {
      name: "minutesUntilStart",
      label: "Minutes Until Start",
      type: "number",
      description: "Number of minutes until event starts"
    }
  ]
}

const outlookTriggerNewContact: NodeComponent = {
  type: "microsoft-outlook_trigger_new_contact",
  title: "New Contact",
  description: "Triggers when a new contact is added",
  icon: UserPlus,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Contacts.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "companyName",
      label: "Company Name Filter",
      type: "text",
      required: false,
      placeholder: "Optional: filter by company name",
      description: "Only trigger for contacts from a specific company"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Contact ID",
      type: "string",
      description: "The unique ID of the contact"
    },
    {
      name: "displayName",
      label: "Display Name",
      type: "string",
      description: "Contact's full name"
    },
    {
      name: "emailAddresses",
      label: "Email Addresses",
      type: "array",
      description: "Contact's email addresses"
    },
    {
      name: "businessPhones",
      label: "Business Phones",
      type: "array",
      description: "Contact's business phone numbers"
    },
    {
      name: "mobilePhone",
      label: "Mobile Phone",
      type: "string",
      description: "Contact's mobile phone number"
    },
    {
      name: "jobTitle",
      label: "Job Title",
      type: "string",
      description: "Contact's job title"
    },
    {
      name: "companyName",
      label: "Company",
      type: "string",
      description: "Contact's company name"
    },
    {
      name: "createdDateTime",
      label: "Created At",
      type: "string",
      description: "When the contact was created"
    }
  ]
}

const outlookTriggerUpdatedContact: NodeComponent = {
  type: "microsoft-outlook_trigger_updated_contact",
  title: "Updated Contact",
  description: "Triggers when a contact is modified",
  icon: Edit,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: true,
  requiredScopes: ["Contacts.Read"],
  producesOutput: true,
  supportsWebhook: true,
  webhookConfig: {
    method: "POST",
    responseFormat: "json"
  },
  configSchema: [
    {
      name: "companyName",
      label: "Company Name Filter",
      type: "text",
      required: false,
      placeholder: "Optional: filter by company name",
      description: "Only trigger for contacts from a specific company"
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "Contact ID",
      type: "string",
      description: "The unique ID of the contact"
    },
    {
      name: "displayName",
      label: "Display Name",
      type: "string",
      description: "Contact's full name"
    },
    {
      name: "emailAddresses",
      label: "Email Addresses",
      type: "array",
      description: "Contact's email addresses"
    },
    {
      name: "lastModifiedDateTime",
      label: "Last Modified",
      type: "string",
      description: "When the contact was last updated"
    }
  ]
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
  ],
  outputSchema: [
    { name: "to", label: "Recipients", type: "string", description: "Email addresses of recipients" },
    { name: "subject", label: "Subject", type: "string", description: "Email subject line" },
    { name: "sent", label: "Sent Successfully", type: "boolean", description: "Whether the email was sent" },
    { name: "sentAt", label: "Sent At", type: "string", description: "Timestamp when email was sent" }
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
    { name: "customDays", label: "Number of days from now", type: "number", required: false, visibilityCondition: { field: "eventDate", operator: "equals", value: "custom_days" }, placeholder: "Enter number of days (e.g., 5)", min: 1, max: 365 },
    { name: "nextWeekday", label: "Select weekday", type: "select", required: false, visibilityCondition: { field: "eventDate", operator: "equals", value: "next_weekday" }, options: [
      { value: "monday", label: "Next Monday" },
      { value: "tuesday", label: "Next Tuesday" },
      { value: "wednesday", label: "Next Wednesday" },
      { value: "thursday", label: "Next Thursday" },
      { value: "friday", label: "Next Friday" },
      { value: "saturday", label: "Next Saturday" },
      { value: "sunday", label: "Next Sunday" }
    ]},
    { name: "specificDate", label: "Specific Date", type: "date", required: false, visibilityCondition: { field: "eventDate", operator: "equals", value: "specific" } },

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
    { name: "customTime", label: "Custom Time", type: "time", required: false, visibilityCondition: { field: "eventTime", operator: "equals", value: "custom" } },

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
    { name: "customEndDate", label: "End Date", type: "date", required: false, visibilityCondition: { field: "duration", operator: "equals", value: "custom" } },
    { name: "customEndTime", label: "End Time", type: "time", required: false, visibilityCondition: { field: "duration", operator: "equals", value: "custom" } },

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
    { name: "customRecurrence", label: "Custom Recurrence", type: "text", required: false, placeholder: "Enter custom RRULE", visibilityCondition: { field: "recurrence", operator: "equals", value: "custom" } },
    { name: "repeatUntil", label: "Repeat Until", type: "date", required: false, placeholder: "End date for recurring events" },
    
    // Meeting Options Section
    { name: "isOnlineMeeting", label: "Online Meeting", type: "boolean", required: false, defaultValue: false },
    { name: "onlineMeetingProvider", label: "Meeting Provider", type: "select", required: false, defaultValue: "teamsForBusiness", options: [
      { value: "teamsForBusiness", label: "Microsoft Teams" },
      { value: "skypeForBusiness", label: "Skype for Business" },
      { value: "skypeForConsumer", label: "Skype" }
    ], visibilityCondition: { field: "isOnlineMeeting", operator: "equals", value: true } },
    
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
  ],
  producesOutput: true,
  outputSchema: [
    { name: "eventId", label: "Event ID", type: "string", description: "The unique ID of the created calendar event" },
    { name: "subject", label: "Subject", type: "string", description: "The subject/title of the event" },
    { name: "startTime", label: "Start Time", type: "string", description: "Event start time (ISO 8601)" },
    { name: "endTime", label: "End Time", type: "string", description: "Event end time (ISO 8601)" },
    { name: "location", label: "Location", type: "string", description: "Event location" },
    { name: "attendees", label: "Attendees", type: "array", description: "List of attendee email addresses" },
    { name: "body", label: "Description", type: "string", description: "Event description/body" },
    { name: "isOnlineMeeting", label: "Is Online Meeting", type: "boolean", description: "Whether this is an online meeting" },
    { name: "onlineMeetingUrl", label: "Online Meeting URL", type: "string", description: "URL for online meeting (Teams, Skype, etc.)" },
    { name: "webLink", label: "Web Link", type: "string", description: "URL to view the event in Outlook" },
    { name: "importance", label: "Importance", type: "string", description: "Event importance level" },
    { name: "sensitivity", label: "Sensitivity", type: "string", description: "Event sensitivity level" }
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
  ],
  outputSchema: [
    { name: "events", label: "Events", type: "array", description: "Array of calendar events" },
    { name: "count", label: "Count", type: "number", description: "Number of events retrieved" }
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
  producesOutput: true,
  outputSchema: [
    { name: "messages", label: "Messages", type: "array", description: "Array of email messages matching the search query" },
    { name: "count", label: "Count", type: "number", description: "Number of messages found" }
  ]
}

const outlookActionReplyToEmail: NodeComponent = {
  type: "microsoft-outlook_action_reply_to_email",
  title: "Reply to Email",
  description: "Reply to an existing email",
  icon: MailPlus,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.Send"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email to reply to", description: "The ID of the email you want to reply to" },
    { name: "replyAll", label: "Reply All", type: "boolean", required: false, defaultValue: false, description: "Reply to all recipients instead of just the sender" },
    { name: "body", label: "Reply Body", type: "email-rich-text", required: true, placeholder: "Type your reply...", provider: "outlook" },
    { name: "attachments", label: "Attachments", type: "file", required: false, placeholder: "Select files to attach", multiple: true }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Reply Email ID", type: "string", description: "ID of the sent reply" },
    { name: "sent", label: "Sent Successfully", type: "boolean", description: "Whether the reply was sent" },
    { name: "sentAt", label: "Sent At", type: "string", description: "Timestamp when reply was sent" }
  ]
}

const outlookActionForwardEmail: NodeComponent = {
  type: "microsoft-outlook_action_forward_email",
  title: "Forward Email",
  description: "Forward an existing email to other recipients",
  icon: Send,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.Send"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email to forward", description: "The ID of the email you want to forward" },
    { name: "to", label: "To", type: "email-autocomplete", required: true, placeholder: "Enter recipient email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "cc", label: "CC", type: "email-autocomplete", required: false, placeholder: "Enter CC email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "comment", label: "Comment", type: "email-rich-text", required: false, placeholder: "Add a comment to the forwarded email...", provider: "outlook", description: "Optional message to add before the forwarded content" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "sent", label: "Sent Successfully", type: "boolean", description: "Whether the forward was sent" },
    { name: "sentAt", label: "Sent At", type: "string", description: "Timestamp when email was forwarded" }
  ]
}

const outlookActionCreateDraftEmail: NodeComponent = {
  type: "microsoft-outlook_action_create_draft_email",
  title: "Create Draft Email",
  description: "Create a draft email for later review and sending",
  icon: FileText,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "to", label: "To", type: "email-autocomplete", required: true, placeholder: "Enter recipient email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "cc", label: "CC", type: "email-autocomplete", required: false, placeholder: "Enter CC email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "bcc", label: "BCC", type: "email-autocomplete", required: false, placeholder: "Enter BCC email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "subject", label: "Subject", type: "text", required: true, placeholder: "Email subject" },
    { name: "body", label: "Body", type: "email-rich-text", required: true, placeholder: "Compose your email...", provider: "outlook" },
    { name: "importance", label: "Importance", type: "select", required: false, defaultValue: "normal", options: [
      { value: "low", label: "Low" },
      { value: "normal", label: "Normal" },
      { value: "high", label: "High" }
    ]}
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Draft Email ID", type: "string", description: "ID of the created draft" },
    { name: "subject", label: "Subject", type: "string", description: "Email subject" },
    { name: "webLink", label: "Web Link", type: "string", description: "URL to open draft in Outlook" }
  ]
}

const outlookActionMoveEmail: NodeComponent = {
  type: "microsoft-outlook_action_move_email",
  title: "Move Email to Folder",
  description: "Move an email to a different folder",
  icon: FolderInput,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email to move", description: "The ID of the email you want to move" },
    { name: "destinationFolderId", label: "Destination Folder", type: "select", required: true, dynamic: "outlook_folders", loadOnMount: true, placeholder: "Select destination folder" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Email ID", type: "string", description: "ID of the moved email" },
    { name: "moved", label: "Moved Successfully", type: "boolean", description: "Whether the email was moved" },
    { name: "newFolderId", label: "New Folder ID", type: "string", description: "ID of the destination folder" }
  ]
}

const outlookActionDeleteEmail: NodeComponent = {
  type: "microsoft-outlook_action_delete_email",
  title: "Delete Email",
  description: "Delete an email message",
  icon: Trash2,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email to delete", description: "The ID of the email you want to delete" },
    { name: "permanentDelete", label: "Permanent Delete", type: "boolean", required: false, defaultValue: false, description: "Permanently delete instead of moving to Deleted Items folder" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "deleted", label: "Deleted Successfully", type: "boolean", description: "Whether the email was deleted" },
    { name: "emailId", label: "Email ID", type: "string", description: "ID of the deleted email" }
  ]
}

const outlookActionAddCategories: NodeComponent = {
  type: "microsoft-outlook_action_add_categories",
  title: "Add Categories to Email",
  description: "Add categories/tags to an email for organization",
  icon: Flag,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.ReadWrite"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email to categorize", description: "The ID of the email you want to add categories to" },
    { name: "categories", label: "Categories", type: "text", required: true, placeholder: "Enter categories (comma-separated)", description: "Categories to add (e.g., 'Important, Follow Up, Project X')" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Email ID", type: "string", description: "ID of the categorized email" },
    { name: "categories", label: "Categories", type: "array", description: "Updated list of categories" }
  ]
}

const outlookActionUpdateCalendarEvent: NodeComponent = {
  type: "microsoft-outlook_action_update_calendar_event",
  title: "Update Calendar Event",
  description: "Update an existing calendar event",
  icon: Edit,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Calendars.ReadWrite"],
  configSchema: [
    { name: "eventId", label: "Event ID", type: "text", required: true, placeholder: "ID of event to update", description: "The ID of the calendar event you want to update" },
    { name: "calendarId", label: "Calendar", type: "select", required: false, dynamic: true, loadOnMount: true, placeholder: "Select calendar (optional)" },
    { name: "subject", label: "Subject", type: "text", required: false, placeholder: "New event subject" },
    { name: "body", label: "Description", type: "textarea", required: false, placeholder: "New event description" },
    { name: "startDateTime", label: "Start Date/Time", type: "datetime-local", required: false },
    { name: "endDateTime", label: "End Date/Time", type: "datetime-local", required: false },
    { name: "location", label: "Location", type: "location-autocomplete", required: false, placeholder: "New location" },
    { name: "attendees", label: "Attendees", type: "email-autocomplete", required: false, placeholder: "Update attendees...", dynamic: "outlook-enhanced-recipients" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Event ID", type: "string", description: "ID of the updated event" },
    { name: "updated", label: "Updated Successfully", type: "boolean", description: "Whether the event was updated" },
    { name: "subject", label: "Subject", type: "string", description: "Updated event subject" }
  ]
}

const outlookActionDeleteCalendarEvent: NodeComponent = {
  type: "microsoft-outlook_action_delete_calendar_event",
  title: "Delete Calendar Event",
  description: "Delete a calendar event",
  icon: Trash2,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Calendars.ReadWrite"],
  configSchema: [
    { name: "eventId", label: "Event ID", type: "text", required: true, placeholder: "ID of event to delete", description: "The ID of the calendar event you want to delete" },
    { name: "calendarId", label: "Calendar", type: "select", required: false, dynamic: true, loadOnMount: true, placeholder: "Select calendar (optional)" },
    { name: "sendCancellation", label: "Send Cancellation Notice", type: "boolean", required: false, defaultValue: true, description: "Send cancellation notice to attendees" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "deleted", label: "Deleted Successfully", type: "boolean", description: "Whether the event was deleted" },
    { name: "eventId", label: "Event ID", type: "string", description: "ID of the deleted event" }
  ]
}

const outlookActionAddAttendees: NodeComponent = {
  type: "microsoft-outlook_action_add_attendees",
  title: "Add Attendees to Event",
  description: "Add attendees to an existing calendar event",
  icon: Users,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Calendars.ReadWrite"],
  configSchema: [
    { name: "eventId", label: "Event ID", type: "text", required: true, placeholder: "ID of event", description: "The ID of the calendar event" },
    { name: "calendarId", label: "Calendar", type: "select", required: false, dynamic: true, loadOnMount: true, placeholder: "Select calendar (optional)" },
    { name: "attendees", label: "Attendees to Add", type: "email-autocomplete", required: true, placeholder: "Enter attendee email addresses...", dynamic: "outlook-enhanced-recipients" },
    { name: "sendInvitation", label: "Send Invitation", type: "boolean", required: false, defaultValue: true, description: "Send meeting invitation to new attendees" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Event ID", type: "string", description: "ID of the event" },
    { name: "attendeesAdded", label: "Attendees Added", type: "array", description: "List of newly added attendees" }
  ]
}

const outlookActionCreateContact: NodeComponent = {
  type: "microsoft-outlook_action_create_contact",
  title: "Create Contact",
  description: "Create a new contact in Outlook",
  icon: UserPlus,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Contacts.ReadWrite"],
  configSchema: [
    { name: "givenName", label: "First Name", type: "text", required: true, placeholder: "First name" },
    { name: "surname", label: "Last Name", type: "text", required: false, placeholder: "Last name" },
    { name: "emailAddress", label: "Email Address", type: "text", required: true, placeholder: "email@example.com" },
    { name: "businessPhone", label: "Business Phone", type: "text", required: false, placeholder: "+1 (555) 123-4567" },
    { name: "mobilePhone", label: "Mobile Phone", type: "text", required: false, placeholder: "+1 (555) 987-6543" },
    { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "Position or role" },
    { name: "companyName", label: "Company", type: "text", required: false, placeholder: "Company name" },
    { name: "department", label: "Department", type: "text", required: false, placeholder: "Department" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Contact ID", type: "string", description: "ID of the created contact" },
    { name: "displayName", label: "Display Name", type: "string", description: "Contact's full name" },
    { name: "emailAddress", label: "Email", type: "string", description: "Contact's email address" }
  ]
}

const outlookActionUpdateContact: NodeComponent = {
  type: "microsoft-outlook_action_update_contact",
  title: "Update Contact",
  description: "Update an existing contact",
  icon: Edit,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Contacts.ReadWrite"],
  configSchema: [
    { name: "contactId", label: "Contact ID", type: "text", required: true, placeholder: "ID of contact to update", description: "The ID of the contact you want to update" },
    { name: "givenName", label: "First Name", type: "text", required: false, placeholder: "First name" },
    { name: "surname", label: "Last Name", type: "text", required: false, placeholder: "Last name" },
    { name: "emailAddress", label: "Email Address", type: "text", required: false, placeholder: "email@example.com" },
    { name: "businessPhone", label: "Business Phone", type: "text", required: false, placeholder: "+1 (555) 123-4567" },
    { name: "mobilePhone", label: "Mobile Phone", type: "text", required: false, placeholder: "+1 (555) 987-6543" },
    { name: "jobTitle", label: "Job Title", type: "text", required: false, placeholder: "Position or role" },
    { name: "companyName", label: "Company", type: "text", required: false, placeholder: "Company name" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "id", label: "Contact ID", type: "string", description: "ID of the updated contact" },
    { name: "updated", label: "Updated Successfully", type: "boolean", description: "Whether the contact was updated" }
  ]
}

const outlookActionDeleteContact: NodeComponent = {
  type: "microsoft-outlook_action_delete_contact",
  title: "Delete Contact",
  description: "Delete a contact from Outlook",
  icon: Trash2,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Contacts.ReadWrite"],
  configSchema: [
    { name: "contactId", label: "Contact ID", type: "text", required: true, placeholder: "ID of contact to delete", description: "The ID of the contact you want to delete" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "deleted", label: "Deleted Successfully", type: "boolean", description: "Whether the contact was deleted" },
    { name: "contactId", label: "Contact ID", type: "string", description: "ID of the deleted contact" }
  ]
}

const outlookActionFindContact: NodeComponent = {
  type: "microsoft-outlook_action_find_contact",
  title: "Find Contact",
  description: "Search for a contact",
  icon: Search,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Contacts.Read"],
  configSchema: [
    { name: "searchQuery", label: "Search Query", type: "text", required: true, placeholder: "Search by name, email, or company", description: "Search contacts by name, email address, or company name" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "contacts", label: "Contacts", type: "array", description: "Array of matching contacts" },
    { name: "count", label: "Count", type: "number", description: "Number of contacts found" }
  ]
}

const outlookActionDownloadAttachment: NodeComponent = {
  type: "microsoft-outlook_action_download_attachment",
  title: "Download Attachment",
  description: "Download an email attachment",
  icon: Paperclip,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.Read"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email", description: "The ID of the email containing the attachment" },
    { name: "attachmentId", label: "Attachment ID", type: "text", required: true, placeholder: "ID of attachment", description: "The ID of the attachment to download" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "name", label: "File Name", type: "string", description: "Name of the attachment file" },
    { name: "contentType", label: "Content Type", type: "string", description: "MIME type of the file" },
    { name: "size", label: "Size", type: "number", description: "File size in bytes" },
    { name: "contentBytes", label: "Content", type: "string", description: "Base64-encoded file content" }
  ]
}

const outlookActionListAttachments: NodeComponent = {
  type: "microsoft-outlook_action_list_attachments",
  title: "List Attachments",
  description: "Get list of attachments from an email",
  icon: Paperclip,
  providerId: "microsoft-outlook",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["Mail.Read"],
  configSchema: [
    { name: "emailId", label: "Email ID", type: "text", required: true, placeholder: "ID of email", description: "The ID of the email to get attachments from" }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "attachments", label: "Attachments", type: "array", description: "Array of attachment metadata (id, name, size, contentType)" },
    { name: "count", label: "Count", type: "number", description: "Number of attachments" }
  ]
}

// Export all Microsoft Outlook nodes
export const outlookNodes: NodeComponent[] = [
  // Email Triggers (4)
  outlookTriggerNewEmail,
  outlookTriggerEmailSent,
  outlookTriggerEmailFlagged,
  outlookTriggerNewAttachment,

  // Calendar Triggers (5)
  outlookTriggerNewCalendarEvent,
  outlookTriggerUpdatedCalendarEvent,
  outlookTriggerDeletedCalendarEvent,
  outlookTriggerCalendarEventStart,

  // Contact Triggers (2)
  outlookTriggerNewContact,
  outlookTriggerUpdatedContact,

  // Email Actions (9)
  outlookActionSendEmail,
  outlookActionReplyToEmail,
  outlookActionForwardEmail,
  outlookActionCreateDraftEmail,
  outlookActionMoveEmail,
  outlookActionDeleteEmail,
  outlookActionAddCategories,
  outlookActionGetEmails,
  outlookActionSearchEmail,

  // Calendar Actions (6)
  outlookActionCreateCalendarEvent,
  outlookActionUpdateCalendarEvent,
  outlookActionDeleteCalendarEvent,
  outlookActionAddAttendees,
  outlookActionGetCalendarEvents,

  // Contact Actions (4)
  outlookActionCreateContact,
  outlookActionUpdateContact,
  outlookActionDeleteContact,
  outlookActionFindContact,

  // Attachment Actions (2)
  outlookActionDownloadAttachment,
  outlookActionListAttachments,
]