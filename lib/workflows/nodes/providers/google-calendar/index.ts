import { Calendar } from "lucide-react"
import { NodeComponent } from "../../types"

export const googleCalendarNodes: NodeComponent[] = [
  {
    type: "google_calendar_trigger_new_event",
    title: "New Event",
    description: "Triggers when a new event is created",
    icon: Calendar,
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
    icon: Calendar,
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
    icon: Calendar,
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
    icon: Calendar,
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
        defaultValue: "next-hour",
        conditionalVisibility: {
          field: "allDay",
          value: false
        }
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
        defaultValue: "1-hour-after-start",
        conditionalVisibility: {
          field: "allDay",
          value: false
        }
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
        ],
        conditionalVisibility: {
          field: "attendees",
          value: true  // Will show when attendees has any truthy value
        }
      },
      { 
        name: "guestsCanInviteOthers", 
        label: "Guests can invite others", 
        type: "boolean", 
        defaultValue: true,
        conditionalVisibility: {
          field: "attendees",
          value: true  // Will show when attendees has any truthy value
        }
      },
      { 
        name: "guestsCanSeeOtherGuests", 
        label: "Guests can see guest list", 
        type: "boolean", 
        defaultValue: true,
        conditionalVisibility: {
          field: "attendees",
          value: true  // Will show when attendees has any truthy value
        }
      },
      { 
        name: "guestsCanModify", 
        label: "Guests can modify event", 
        type: "boolean", 
        defaultValue: false,
        conditionalVisibility: {
          field: "attendees",
          value: true  // Will show when attendees has any truthy value
        }
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
]