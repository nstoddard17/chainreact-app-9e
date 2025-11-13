import { NodeComponent } from "../../../types"
import { FileText, CheckSquare, Phone, Video } from "lucide-react"

/**
 * Note Created Trigger
 * Triggers when a new note is created in HubSpot
 *
 * API Verification:
 * - Webhook: note.creation
 * - Subscription Type: note.creation
 * - Docs: https://developers.hubspot.com/docs/api/webhooks
 */
export const hubspotTriggerNoteCreated: NodeComponent = {
  type: "hubspot_trigger_note_created",
  title: "Note Created",
  description: "Triggers when a new note is created in HubSpot",
  icon: FileText,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByOwner",
      label: "Filter by Owner (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_owners",
      loadOnMount: true,
      placeholder: "All notes",
      description: "Only trigger for notes created by a specific owner"
    }
  ],
  outputSchema: [
    {
      name: "noteId",
      label: "Note ID",
      type: "string",
      description: "The unique ID of the created note"
    },
    {
      name: "hs_note_body",
      label: "Note Content",
      type: "string",
      description: "The content of the note"
    },
    {
      name: "hs_timestamp",
      label: "Timestamp",
      type: "string",
      description: "When the note was created"
    },
    {
      name: "hubspot_owner_id",
      label: "Owner ID",
      type: "string",
      description: "The ID of the note owner"
    },
    {
      name: "hubspot_owner_name",
      label: "Owner Name",
      type: "string",
      description: "Owner name when provided by HubSpot"
    },
    {
      name: "associatedContactIds",
      label: "Associated Contact IDs",
      type: "array",
      description: "IDs of associated contacts"
    },
    {
      name: "associatedCompanyIds",
      label: "Associated Company IDs",
      type: "array",
      description: "IDs of associated companies"
    },
    {
      name: "associatedDealIds",
      label: "Associated Deal IDs",
      type: "array",
      description: "IDs of associated deals"
    },
    {
      name: "associatedTicketIds",
      label: "Associated Ticket IDs",
      type: "array",
      description: "IDs of associated tickets"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the note was created in HubSpot"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    },
    {
      name: "properties",
      label: "All Properties",
      type: "object",
      description: "Full note property payload"
    }
  ],
}

/**
 * Task Created Trigger
 * Triggers when a new task is created in HubSpot
 *
 * API Verification:
 * - Webhook: task.creation
 * - Subscription Type: task.creation
 */
export const hubspotTriggerTaskCreated: NodeComponent = {
  type: "hubspot_trigger_task_created",
  title: "Task Created",
  description: "Triggers when a new task is created in HubSpot",
  icon: CheckSquare,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByOwner",
      label: "Filter by Owner (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_owners",
      loadOnMount: true,
      placeholder: "All tasks",
      description: "Only trigger for tasks assigned to a specific owner"
    },
    {
      name: "filterByPriority",
      label: "Filter by Priority (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Priorities" },
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" }
      ],
      required: false,
      placeholder: "All priorities",
      description: "Only trigger for tasks with specific priority"
    },
    {
      name: "filterByType",
      label: "Filter by Type (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Types" },
        { value: "TODO", label: "To-Do" },
        { value: "EMAIL", label: "Email" },
        { value: "CALL", label: "Call" },
        { value: "MEETING", label: "Meeting" }
      ],
      required: false,
      placeholder: "All types",
      description: "Only trigger for specific task types"
    }
  ],
  outputSchema: [
    {
      name: "taskId",
      label: "Task ID",
      type: "string",
      description: "The unique ID of the created task"
    },
    {
      name: "hs_task_subject",
      label: "Task Title",
      type: "string",
      description: "The task title/subject"
    },
    {
      name: "hs_task_body",
      label: "Task Description",
      type: "string",
      description: "The task description"
    },
    {
      name: "hs_task_status",
      label: "Status",
      type: "string",
      description: "The task status"
    },
    {
      name: "hs_task_priority",
      label: "Priority",
      type: "string",
      description: "The task priority (LOW, MEDIUM, HIGH)"
    },
    {
      name: "hs_task_type",
      label: "Task Type",
      type: "string",
      description: "The type of task"
    },
    {
      name: "hs_timestamp",
      label: "Due Date",
      type: "string",
      description: "When the task is due"
    },
    {
      name: "hubspot_owner_id",
      label: "Owner ID",
      type: "string",
      description: "The ID of the task owner"
    },
    {
      name: "hubspot_owner_name",
      label: "Owner Name",
      type: "string",
      description: "Owner name when provided"
    },
    {
      name: "associatedContactIds",
      label: "Associated Contact IDs",
      type: "array",
      description: "IDs of associated contacts"
    },
    {
      name: "associatedCompanyIds",
      label: "Associated Company IDs",
      type: "array",
      description: "IDs of associated companies"
    },
    {
      name: "associatedDealIds",
      label: "Associated Deal IDs",
      type: "array",
      description: "IDs of associated deals"
    },
    {
      name: "associatedTicketIds",
      label: "Associated Ticket IDs",
      type: "array",
      description: "IDs of associated tickets"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the task was created in HubSpot"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    },
    {
      name: "properties",
      label: "All Properties",
      type: "object",
      description: "Full task property payload"
    }
  ],
}

/**
 * Call Created Trigger
 * Triggers when a new call is logged in HubSpot
 *
 * API Verification:
 * - Webhook: call.creation
 * - Subscription Type: call.creation
 */
export const hubspotTriggerCallCreated: NodeComponent = {
  type: "hubspot_trigger_call_created",
  title: "Call Logged",
  description: "Triggers when a new call is logged in HubSpot",
  icon: Phone,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByOwner",
      label: "Filter by Owner (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_owners",
      loadOnMount: true,
      placeholder: "All calls",
      description: "Only trigger for calls created by a specific owner"
    },
    {
      name: "filterByDirection",
      label: "Filter by Direction (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Calls" },
        { value: "INBOUND", label: "Inbound Only" },
        { value: "OUTBOUND", label: "Outbound Only" }
      ],
      required: false,
      placeholder: "All directions",
      description: "Only trigger for inbound or outbound calls"
    },
    {
      name: "filterByDisposition",
      label: "Filter by Outcome (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Outcomes" },
        { value: "CONNECTED", label: "Connected" },
        { value: "NO_ANSWER", label: "No Answer" },
        { value: "LEFT_VOICEMAIL", label: "Left Voicemail" },
        { value: "LEFT_LIVE_MESSAGE", label: "Left Live Message" },
        { value: "BUSY", label: "Busy" },
        { value: "WRONG_NUMBER", label: "Wrong Number" }
      ],
      required: false,
      placeholder: "All outcomes",
      description: "Only trigger for calls with specific outcome"
    }
  ],
  outputSchema: [
    {
      name: "callId",
      label: "Call ID",
      type: "string",
      description: "The unique ID of the logged call"
    },
    {
      name: "hs_call_title",
      label: "Call Title",
      type: "string",
      description: "The call title"
    },
    {
      name: "hs_call_body",
      label: "Call Notes",
      type: "string",
      description: "Notes from the call"
    },
    {
      name: "hs_call_duration",
      label: "Duration",
      type: "number",
      description: "Call duration in milliseconds"
    },
    {
      name: "hs_call_direction",
      label: "Direction",
      type: "string",
      description: "Call direction (INBOUND/OUTBOUND)"
    },
    {
      name: "hs_call_disposition",
      label: "Outcome",
      type: "string",
      description: "Call outcome/disposition"
    },
    {
      name: "hs_call_status",
      label: "Status",
      type: "string",
      description: "Call status"
    },
    {
      name: "hs_timestamp",
      label: "Call Time",
      type: "string",
      description: "When the call occurred"
    },
    {
      name: "hubspot_owner_id",
      label: "Owner ID",
      type: "string",
      description: "The ID of the call owner"
    },
    {
      name: "hubspot_owner_name",
      label: "Owner Name",
      type: "string",
      description: "Owner name when provided"
    },
    {
      name: "associatedContactIds",
      label: "Associated Contact IDs",
      type: "array",
      description: "IDs of associated contacts"
    },
    {
      name: "associatedCompanyIds",
      label: "Associated Company IDs",
      type: "array",
      description: "IDs of associated companies"
    },
    {
      name: "associatedDealIds",
      label: "Associated Deal IDs",
      type: "array",
      description: "IDs of associated deals"
    },
    {
      name: "associatedTicketIds",
      label: "Associated Ticket IDs",
      type: "array",
      description: "IDs of associated tickets"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the call was logged in HubSpot"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    },
    {
      name: "properties",
      label: "All Properties",
      type: "object",
      description: "Full call property payload"
    }
  ],
}

/**
 * Meeting Created Trigger
 * Triggers when a new meeting is logged in HubSpot
 *
 * API Verification:
 * - Webhook: meeting.creation
 * - Subscription Type: meeting.creation
 */
export const hubspotTriggerMeetingCreated: NodeComponent = {
  type: "hubspot_trigger_meeting_created",
  title: "Meeting Logged",
  description: "Triggers when a new meeting is logged in HubSpot",
  icon: Video,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByOwner",
      label: "Filter by Owner (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_owners",
      loadOnMount: true,
      placeholder: "All meetings",
      description: "Only trigger for meetings created by a specific owner"
    },
    {
      name: "filterByOutcome",
      label: "Filter by Outcome (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Outcomes" },
        { value: "SCHEDULED", label: "Scheduled" },
        { value: "COMPLETED", label: "Completed" },
        { value: "RESCHEDULED", label: "Rescheduled" },
        { value: "NO_SHOW", label: "No Show" },
        { value: "CANCELED", label: "Canceled" }
      ],
      required: false,
      placeholder: "All outcomes",
      description: "Only trigger for meetings with specific outcome"
    }
  ],
  outputSchema: [
    {
      name: "meetingId",
      label: "Meeting ID",
      type: "string",
      description: "The unique ID of the logged meeting"
    },
    {
      name: "hs_meeting_title",
      label: "Meeting Title",
      type: "string",
      description: "The meeting title"
    },
    {
      name: "hs_meeting_body",
      label: "Meeting Notes",
      type: "string",
      description: "Notes from the meeting"
    },
    {
      name: "hs_meeting_start_time",
      label: "Start Time",
      type: "string",
      description: "Meeting start time (ISO 8601)"
    },
    {
      name: "hs_meeting_end_time",
      label: "End Time",
      type: "string",
      description: "Meeting end time (ISO 8601)"
    },
    {
      name: "hs_meeting_location",
      label: "Location",
      type: "string",
      description: "Meeting location"
    },
    {
      name: "hs_meeting_outcome",
      label: "Outcome",
      type: "string",
      description: "Meeting outcome"
    },
    {
      name: "hs_timestamp",
      label: "Meeting Time",
      type: "string",
      description: "When the meeting occurred"
    },
    {
      name: "hubspot_owner_id",
      label: "Owner ID",
      type: "string",
      description: "The ID of the meeting owner"
    },
    {
      name: "hubspot_owner_name",
      label: "Owner Name",
      type: "string",
      description: "Owner name when provided"
    },
    {
      name: "associatedContactIds",
      label: "Associated Contact IDs",
      type: "array",
      description: "IDs of associated contacts"
    },
    {
      name: "associatedCompanyIds",
      label: "Associated Company IDs",
      type: "array",
      description: "IDs of associated companies"
    },
    {
      name: "associatedDealIds",
      label: "Associated Deal IDs",
      type: "array",
      description: "IDs of associated deals"
    },
    {
      name: "associatedTicketIds",
      label: "Associated Ticket IDs",
      type: "array",
      description: "IDs of associated tickets"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the meeting was logged in HubSpot"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    },
    {
      name: "properties",
      label: "All Properties",
      type: "object",
      description: "Full meeting property payload"
    }
  ],
}

// Export all engagement triggers
export const engagementTriggers = [
  hubspotTriggerNoteCreated,
  hubspotTriggerTaskCreated,
  hubspotTriggerCallCreated,
  hubspotTriggerMeetingCreated
]
