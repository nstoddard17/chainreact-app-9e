import { NodeComponent } from "../../../types"
import { FileText, CheckSquare, Phone, Video } from "lucide-react"

/**
 * Create Note Action
 * Creates a note engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/notes
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/notes
 * - Scopes: crm.objects.contacts.write (notes are engagements tied to CRM objects)
 * - Notes can be associated with contacts, companies, deals, and tickets
 */
export const hubspotActionCreateNote: NodeComponent = {
  type: "hubspot_action_create_note",
  title: "Create Note",
  description: "Create a note and associate it with CRM records",
  icon: FileText,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    {
      name: "hs_note_body",
      label: "Note Content",
      type: "textarea",
      required: true,
      placeholder: "Enter note content...",
      description: "The body text of the note"
    },

    // Timestamp
    {
      name: "hs_timestamp",
      label: "Timestamp",
      type: "datetime",
      required: false,
      defaultValue: "{{now}}",
      placeholder: "2025-01-15T10:30:00Z"
    },

    // Associations
    {
      name: "associatedContactId",
      label: "Associated Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      required: false,
      placeholder: "Link to a contact",
      description: "Associate this note with a contact",
      loadOnMount: true
    },
    {
      name: "associatedCompanyId",
      label: "Associated Company",
      type: "combobox",
      dynamic: "hubspot_companies",
      required: false,
      placeholder: "Link to a company",
      description: "Associate this note with a company",
      loadOnMount: true
    },
    {
      name: "associatedDealId",
      label: "Associated Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      required: false,
      placeholder: "Link to a deal",
      description: "Associate this note with a deal",
      loadOnMount: true
    },
    {
      name: "associatedTicketId",
      label: "Associated Ticket",
      type: "combobox",
      dynamic: "hubspot_tickets",
      required: false,
      placeholder: "Link to a ticket",
      description: "Associate this note with a ticket",
      loadOnMount: true
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "Owner",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to owner",
      description: "Assign this note to a specific HubSpot user"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "noteId", label: "Note ID", type: "string", description: "The unique ID of the created note" },
    { name: "hs_note_body", label: "Note Content", type: "string", description: "The content of the note" },
    { name: "hs_timestamp", label: "Timestamp", type: "string", description: "When the note was created (ISO 8601)" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the note owner" },
    { name: "associatedContactId", label: "Contact ID", type: "string", description: "ID of associated contact" },
    { name: "associatedCompanyId", label: "Company ID", type: "string", description: "ID of associated company" },
    { name: "associatedDealId", label: "Deal ID", type: "string", description: "ID of associated deal" },
    { name: "associatedTicketId", label: "Ticket ID", type: "string", description: "ID of associated ticket" },
    { name: "createdate", label: "Create Date", type: "string", description: "When the note was created in HubSpot" },
    { name: "properties", label: "All Properties", type: "object", description: "All note properties" }
  ]
}

/**
 * Create Task Action
 * Creates a task engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tasks
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/tasks
 * - Scopes: crm.objects.contacts.write
 * - Tasks represent to-do items associated with CRM records
 */
export const hubspotActionCreateTask: NodeComponent = {
  type: "hubspot_action_create_task",
  title: "Create Task",
  description: "Create a task and associate it with CRM records",
  icon: CheckSquare,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    {
      name: "hs_task_subject",
      label: "Task Title",
      type: "text",
      required: true,
      placeholder: "Follow up with customer",
      description: "Brief title/subject of the task"
    },
    {
      name: "hs_task_body",
      label: "Task Description",
      type: "textarea",
      required: false,
      placeholder: "Additional details about the task...",
      description: "Detailed description of what needs to be done"
    },

    // Task Details
    {
      name: "hs_task_status",
      label: "Task Status",
      type: "select",
      options: [
        { value: "NOT_STARTED", label: "Not Started" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "COMPLETED", label: "Completed" },
        { value: "WAITING", label: "Waiting" },
        { value: "DEFERRED", label: "Deferred" }
      ],
      required: false,
      defaultValue: "NOT_STARTED",
      placeholder: "Select status"
    },
    {
      name: "hs_task_priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" }
      ],
      required: false,
      defaultValue: "MEDIUM",
      placeholder: "Select priority"
    },
    {
      name: "hs_task_type",
      label: "Task Type",
      type: "select",
      options: [
        { value: "TODO", label: "To-Do" },
        { value: "EMAIL", label: "Email" },
        { value: "CALL", label: "Call" },
        { value: "MEETING", label: "Meeting" }
      ],
      required: false,
      defaultValue: "TODO",
      placeholder: "Select type"
    },

    // Due Date
    {
      name: "hs_timestamp",
      label: "Due Date",
      type: "datetime-local",
      required: false,
      placeholder: "Select date & time"
    },

    // Reminder
    {
      name: "hs_task_reminders",
      label: "Reminder (minutes before)",
      type: "number",
      required: false,
      placeholder: "60",
      description: "Set a reminder X minutes before the due date"
    },

    // Associations
    {
      name: "associatedContactId",
      label: "Associated Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      required: false,
      placeholder: "Link to a contact",
      description: "Associate this task with a contact",
      loadOnMount: true
    },
    {
      name: "associatedCompanyId",
      label: "Associated Company",
      type: "combobox",
      dynamic: "hubspot_companies",
      required: false,
      placeholder: "Link to a company",
      description: "Associate this task with a company",
      loadOnMount: true
    },
    {
      name: "associatedDealId",
      label: "Associated Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      required: false,
      placeholder: "Link to a deal",
      description: "Associate this task with a deal",
      loadOnMount: true
    },
    {
      name: "associatedTicketId",
      label: "Associated Ticket",
      type: "combobox",
      dynamic: "hubspot_tickets",
      required: false,
      placeholder: "Link to a ticket",
      description: "Associate this task with a ticket",
      loadOnMount: true
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "Assign To",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to owner",
      description: "Assign this task to a specific HubSpot user"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "taskId", label: "Task ID", type: "string", description: "The unique ID of the created task" },
    { name: "hs_task_subject", label: "Task Title", type: "string", description: "The task title" },
    { name: "hs_task_body", label: "Task Description", type: "string", description: "The task description" },
    { name: "hs_task_status", label: "Status", type: "string", description: "The task status" },
    { name: "hs_task_priority", label: "Priority", type: "string", description: "The task priority" },
    { name: "hs_task_type", label: "Task Type", type: "string", description: "The type of task" },
    { name: "hs_timestamp", label: "Due Date", type: "string", description: "When the task is due (ISO 8601)" },
    { name: "hs_task_reminders", label: "Reminder", type: "number", description: "Reminder time in minutes" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the task owner" },
    { name: "associatedContactId", label: "Contact ID", type: "string", description: "ID of associated contact" },
    { name: "associatedCompanyId", label: "Company ID", type: "string", description: "ID of associated company" },
    { name: "associatedDealId", label: "Deal ID", type: "string", description: "ID of associated deal" },
    { name: "associatedTicketId", label: "Ticket ID", type: "string", description: "ID of associated ticket" },
    { name: "createdate", label: "Create Date", type: "string", description: "When the task was created in HubSpot" },
    { name: "properties", label: "All Properties", type: "object", description: "All task properties" }
  ]
}

/**
 * Create Call Action
 * Creates a call engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/calls
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/calls
 * - Scopes: crm.objects.contacts.write
 */
export const hubspotActionCreateCall: NodeComponent = {
  type: "hubspot_action_create_call",
  title: "Create Call",
  description: "Log a call engagement in HubSpot",
  icon: Phone,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    {
      name: "hs_call_title",
      label: "Call Title",
      type: "text",
      required: false,
      placeholder: "Discovery call with prospect",
      description: "Brief title of the call"
    },
    {
      name: "hs_call_body",
      label: "Call Notes",
      type: "textarea",
      required: false,
      placeholder: "Notes from the call...",
      description: "Detailed notes about the call"
    },

    // Call Details
    {
      name: "hs_call_duration",
      label: "Duration (milliseconds)",
      type: "number",
      required: false,
      placeholder: "1800000",
      description: "Call duration in milliseconds (e.g., 1800000 = 30 minutes)"
    },
    {
      name: "hs_call_direction",
      label: "Call Direction",
      type: "select",
      options: [
        { value: "INBOUND", label: "Inbound (Received)" },
        { value: "OUTBOUND", label: "Outbound (Made)" }
      ],
      required: false,
      placeholder: "Select direction"
    },
    {
      name: "hs_call_disposition",
      label: "Call Outcome",
      type: "select",
      options: [
        { value: "BUSY", label: "Busy" },
        { value: "CONNECTED", label: "Connected" },
        { value: "LEFT_LIVE_MESSAGE", label: "Left Live Message" },
        { value: "LEFT_VOICEMAIL", label: "Left Voicemail" },
        { value: "NO_ANSWER", label: "No Answer" },
        { value: "WRONG_NUMBER", label: "Wrong Number" }
      ],
      required: false,
      placeholder: "Select outcome"
    },
    {
      name: "hs_call_status",
      label: "Call Status",
      type: "select",
      options: [
        { value: "COMPLETED", label: "Completed" },
        { value: "SCHEDULED", label: "Scheduled" },
        { value: "RINGING", label: "Ringing" },
        { value: "CALLING", label: "Calling" },
        { value: "CANCELED", label: "Canceled" },
        { value: "FAILED", label: "Failed" }
      ],
      required: false,
      defaultValue: "COMPLETED",
      placeholder: "Select status"
    },

    // Timestamp
    {
      name: "hs_timestamp",
      label: "Call Time",
      type: "datetime",
      required: false,
      defaultValue: "{{now}}",
      placeholder: "2025-01-15T10:30:00Z",
      description: "When this call occurred (defaults to now)"
    },

    // Associations
    {
      name: "associatedContactId",
      label: "Associated Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a contact",
      description: "Associate this call with a contact"
    },
    {
      name: "associatedCompanyId",
      label: "Associated Company",
      type: "combobox",
      dynamic: "hubspot_companies",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a company",
      description: "Associate this call with a company"
    },
    {
      name: "associatedDealId",
      label: "Associated Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a deal",
      description: "Associate this call with a deal"
    },
    {
      name: "associatedTicketId",
      label: "Associated Ticket",
      type: "combobox",
      dynamic: "hubspot_tickets",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a ticket",
      description: "Associate this call with a ticket"
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "Owner",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to owner",
      description: "Assign this call to a specific HubSpot user"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "callId", label: "Call ID", type: "string", description: "The unique ID of the created call" },
    { name: "hs_call_title", label: "Call Title", type: "string", description: "The call title" },
    { name: "hs_call_body", label: "Call Notes", type: "string", description: "Notes from the call" },
    { name: "hs_call_duration", label: "Duration", type: "number", description: "Call duration in milliseconds" },
    { name: "hs_call_direction", label: "Direction", type: "string", description: "Call direction (inbound/outbound)" },
    { name: "hs_call_disposition", label: "Outcome", type: "string", description: "Call outcome/disposition" },
    { name: "hs_call_status", label: "Status", type: "string", description: "Call status" },
    { name: "hs_timestamp", label: "Call Time", type: "string", description: "When the call occurred (ISO 8601)" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the call owner" },
    { name: "associatedContactId", label: "Contact ID", type: "string", description: "ID of associated contact" },
    { name: "associatedCompanyId", label: "Company ID", type: "string", description: "ID of associated company" },
    { name: "associatedDealId", label: "Deal ID", type: "string", description: "ID of associated deal" },
    { name: "associatedTicketId", label: "Ticket ID", type: "string", description: "ID of associated ticket" },
    { name: "createdate", label: "Create Date", type: "string", description: "When the call was logged in HubSpot" },
    { name: "properties", label: "All Properties", type: "object", description: "All call properties" }
  ]
}

/**
 * Create Meeting Action
 * Creates a meeting engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/meetings
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/meetings
 * - Scopes: crm.objects.contacts.write
 */
export const hubspotActionCreateMeeting: NodeComponent = {
  type: "hubspot_action_create_meeting",
  title: "Create Meeting",
  description: "Log a meeting engagement in HubSpot",
  icon: Video,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.contacts.write"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    {
      name: "hs_meeting_title",
      label: "Meeting Title",
      type: "text",
      required: true,
      placeholder: "Product demo meeting",
      description: "Title of the meeting"
    },
    {
      name: "hs_meeting_body",
      label: "Meeting Notes",
      type: "textarea",
      required: false,
      placeholder: "Agenda and notes from the meeting...",
      description: "Meeting agenda or notes"
    },

    // Meeting Details
    {
      name: "hs_meeting_start_time",
      label: "Start Time",
      type: "datetime-local",
      supportsAI: true,
      required: false,
      placeholder: "2025-01-20T14:00:00Z",
      description: undefined
    },
    {
      name: "hs_meeting_end_time",
      label: "End Time",
      type: "datetime-local",
      supportsAI: true,
      required: false,
      placeholder: "2025-01-20T15:00:00Z",
      description: undefined
    },
    {
      name: "hs_meeting_location",
      label: "Location",
      type: "text",
      required: false,
      placeholder: "Zoom, Conference Room A, etc.",
      description: "Where the meeting takes place"
    },
    {
      name: "hs_meeting_outcome",
      label: "Meeting Outcome",
      type: "select",
      options: [
        { value: "SCHEDULED", label: "Scheduled" },
        { value: "COMPLETED", label: "Completed" },
        { value: "RESCHEDULED", label: "Rescheduled" },
        { value: "NO_SHOW", label: "No Show" },
        { value: "CANCELED", label: "Canceled" }
      ],
      required: false,
      defaultValue: "SCHEDULED",
      placeholder: "Select outcome"
    },

    // Timestamp
    {
      name: "hs_timestamp",
      label: "Meeting Time",
      type: "datetime-local",
      supportsAI: true,
      required: false,
      defaultValue: "{{now}}",
      placeholder: "2025-01-15T10:30:00Z",
      description: undefined
    },

    // Associations
    {
      name: "associatedContactId",
      label: "Associated Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a contact",
      description: "Associate this meeting with a contact"
    },
    {
      name: "associatedCompanyId",
      label: "Associated Company",
      type: "combobox",
      dynamic: "hubspot_companies",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a company",
      description: "Associate this meeting with a company"
    },
    {
      name: "associatedDealId",
      label: "Associated Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a deal",
      description: "Associate this meeting with a deal"
    },
    {
      name: "associatedTicketId",
      label: "Associated Ticket",
      type: "combobox",
      dynamic: "hubspot_tickets",
      loadOnMount: true,
      required: false,
      placeholder: "Link to a ticket",
      description: "Associate this meeting with a ticket"
    },

    // Ownership
    {
      name: "hubspot_owner_id",
      label: "Owner",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to owner",
      description: "Assign this meeting to a specific HubSpot user"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "meetingId", label: "Meeting ID", type: "string", description: "The unique ID of the created meeting" },
    { name: "hs_meeting_title", label: "Meeting Title", type: "string", description: "The meeting title" },
    { name: "hs_meeting_body", label: "Meeting Notes", type: "string", description: "Notes from the meeting" },
    { name: "hs_meeting_start_time", label: "Start Time", type: "string", description: "Meeting start time (ISO 8601)" },
    { name: "hs_meeting_end_time", label: "End Time", type: "string", description: "Meeting end time (ISO 8601)" },
    { name: "hs_meeting_location", label: "Location", type: "string", description: "Meeting location" },
    { name: "hs_meeting_outcome", label: "Outcome", type: "string", description: "Meeting outcome" },
    { name: "hs_timestamp", label: "Meeting Time", type: "string", description: "When the meeting occurred (ISO 8601)" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the meeting owner" },
    { name: "associatedContactId", label: "Contact ID", type: "string", description: "ID of associated contact" },
    { name: "associatedCompanyId", label: "Company ID", type: "string", description: "ID of associated company" },
    { name: "associatedDealId", label: "Deal ID", type: "string", description: "ID of associated deal" },
    { name: "associatedTicketId", label: "Ticket ID", type: "string", description: "ID of associated ticket" },
    { name: "createdate", label: "Create Date", type: "string", description: "When the meeting was logged in HubSpot" },
    { name: "properties", label: "All Properties", type: "object", description: "All meeting properties" }
  ]
}

// Export all engagement actions
export const engagementActions = [
  hubspotActionCreateNote,
  hubspotActionCreateTask,
  hubspotActionCreateCall,
  hubspotActionCreateMeeting
]
