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
        name: "calendars",
        label: "Calendars",
        type: "multiselect",
        multiple: true,
        dynamic: "google-calendars",
        loadOnMount: true,
        required: true,
      },
      {
        name: "eventTypes",
        label: "Event Types",
        type: "select",
        defaultValue: "all",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "all", label: "All Events" },
          { value: "regular", label: "Regular Events Only" },
          { value: "all_day", label: "All-Day Events Only" },
          { value: "recurring", label: "Recurring Events Only" },
          { value: "non_recurring", label: "Non-Recurring Events Only" }
        ],
        description: "Filter events by their type",
        tooltip: "Choose which type of events should trigger this workflow"
      },
      {
        name: "includeEventsWith",
        label: "Only Include Events With",
        type: "multiselect",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        placeholder: "All events (no requirements)",
        options: [
          { value: "attendees", label: "Attendees" },
          { value: "location", label: "Location" },
          { value: "meet_link", label: "Google Meet Link" },
          { value: "attachments", label: "Attachments" },
          { value: "description", label: "Description" }
        ],
        description: "Only trigger for events that have these properties",
        tooltip: "Leave empty to include all events regardless of their properties"
      },
      {
        name: "timeRange",
        label: "Time Range",
        type: "select",
        defaultValue: "any",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "any", label: "Any Time" },
          { value: "work_hours", label: "During Work Hours (9am-5pm)" },
          { value: "after_hours", label: "After Hours (before 9am or after 5pm)" },
          { value: "weekdays", label: "Weekdays Only (Mon-Fri)" },
          { value: "weekends", label: "Weekends Only (Sat-Sun)" }
        ],
        description: "Filter events by when they occur",
        tooltip: "Based on event start time in your local timezone"
      }
    ],
    outputSchema: [
      {
        name: "eventId",
        label: "Event ID",
        type: "string",
        description: "Unique identifier for the event"
      },
      {
        name: "summary",
        label: "Event Title",
        type: "string",
        description: "Title/summary of the event"
      },
      {
        name: "description",
        label: "Description",
        type: "string",
        description: "Event description"
      },
      {
        name: "location",
        label: "Location",
        type: "string",
        description: "Event location"
      },
      {
        name: "start",
        label: "Start Time",
        type: "object",
        description: "Event start date and time"
      },
      {
        name: "end",
        label: "End Time",
        type: "object",
        description: "Event end date and time"
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
        name: "htmlLink",
        label: "Event Link",
        type: "string",
        description: "Link to the event in Google Calendar"
      },
      {
        name: "hangoutLink",
        label: "Meet Link",
        type: "string",
        description: "Google Meet link if attached"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "ISO timestamp when event was created"
      }
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
        name: "calendars",
        label: "Calendars",
        type: "multiselect",
        multiple: true,
        dynamic: "google-calendars",
        loadOnMount: true,
        required: true,
      },
      {
        name: "eventTypes",
        label: "Event Types",
        type: "select",
        defaultValue: "all",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "all", label: "All Events" },
          { value: "regular", label: "Regular Events Only" },
          { value: "all_day", label: "All-Day Events Only" },
          { value: "recurring", label: "Recurring Events Only" },
          { value: "non_recurring", label: "Non-Recurring Events Only" }
        ],
        description: "Filter events by their type",
        tooltip: "Choose which type of events should trigger this workflow"
      },
      {
        name: "includeEventsWith",
        label: "Only Include Events With",
        type: "multiselect",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        placeholder: "All events (no requirements)",
        options: [
          { value: "attendees", label: "Attendees" },
          { value: "location", label: "Location" },
          { value: "meet_link", label: "Google Meet Link" },
          { value: "attachments", label: "Attachments" },
          { value: "description", label: "Description" }
        ],
        description: "Only trigger for events that have these properties",
        tooltip: "Leave empty to include all events regardless of their properties"
      },
      {
        name: "timeRange",
        label: "Time Range",
        type: "select",
        defaultValue: "any",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "any", label: "Any Time" },
          { value: "work_hours", label: "During Work Hours (9am-5pm)" },
          { value: "after_hours", label: "After Hours (before 9am or after 5pm)" },
          { value: "weekdays", label: "Weekdays Only (Mon-Fri)" },
          { value: "weekends", label: "Weekends Only (Sat-Sun)" }
        ],
        description: "Filter events by when they occur",
        tooltip: "Based on event start time in your local timezone"
      }
    ],
    outputSchema: [
      {
        name: "eventId",
        label: "Event ID",
        type: "string",
        description: "Unique identifier for the updated event"
      },
      {
        name: "summary",
        label: "Event Title",
        type: "string",
        description: "Updated title/summary of the event"
      },
      {
        name: "description",
        label: "Description",
        type: "string",
        description: "Updated event description"
      },
      {
        name: "location",
        label: "Location",
        type: "string",
        description: "Updated event location"
      },
      {
        name: "start",
        label: "Start Time",
        type: "object",
        description: "Updated event start date and time"
      },
      {
        name: "end",
        label: "End Time",
        type: "object",
        description: "Updated event end date and time"
      },
      {
        name: "attendees",
        label: "Attendees",
        type: "array",
        description: "Updated list of event attendees"
      },
      {
        name: "organizer",
        label: "Organizer",
        type: "object",
        description: "Event organizer information"
      },
      {
        name: "htmlLink",
        label: "Event Link",
        type: "string",
        description: "Link to the event in Google Calendar"
      },
      {
        name: "hangoutLink",
        label: "Meet Link",
        type: "string",
        description: "Google Meet link if attached"
      },
      {
        name: "updatedTime",
        label: "Updated Time",
        type: "string",
        description: "ISO timestamp when event was last updated"
      },
      {
        name: "changes",
        label: "Changes",
        type: "object",
        description: "Object describing what fields were changed"
      }
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
        name: "calendars",
        label: "Calendars",
        type: "multiselect",
        multiple: true,
        dynamic: "google-calendars",
        loadOnMount: true,
        required: true,
      },
      {
        name: "eventTypes",
        label: "Event Types",
        type: "select",
        defaultValue: "all",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "all", label: "All Events" },
          { value: "regular", label: "Regular Events Only" },
          { value: "all_day", label: "All-Day Events Only" },
          { value: "recurring", label: "Recurring Events Only" },
          { value: "non_recurring", label: "Non-Recurring Events Only" }
        ],
        description: "Filter events by their type",
        tooltip: "Choose which type of events should trigger this workflow"
      },
      {
        name: "includeEventsWith",
        label: "Only Include Events With",
        type: "multiselect",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        placeholder: "All events (no requirements)",
        options: [
          { value: "attendees", label: "Attendees" },
          { value: "location", label: "Location" },
          { value: "meet_link", label: "Google Meet Link" },
          { value: "attachments", label: "Attachments" },
          { value: "description", label: "Description" }
        ],
        description: "Only trigger for events that have these properties",
        tooltip: "Leave empty to include all events regardless of their properties"
      },
      {
        name: "timeRange",
        label: "Time Range",
        type: "select",
        defaultValue: "any",
        required: false,
        dependsOn: "calendars",
        hidden: {
          $deps: ["calendars"],
          $condition: { calendars: { $exists: false } }
        },
        options: [
          { value: "any", label: "Any Time" },
          { value: "work_hours", label: "During Work Hours (9am-5pm)" },
          { value: "after_hours", label: "After Hours (before 9am or after 5pm)" },
          { value: "weekdays", label: "Weekdays Only (Mon-Fri)" },
          { value: "weekends", label: "Weekends Only (Sat-Sun)" }
        ],
        description: "Filter events by when they occur",
        tooltip: "Based on event start time in your local timezone"
      }
    ],
    outputSchema: [
      {
        name: "eventId",
        label: "Event ID",
        type: "string",
        description: "Unique identifier for the canceled event"
      },
      {
        name: "summary",
        label: "Event Title",
        type: "string",
        description: "Title/summary of the canceled event"
      },
      {
        name: "description",
        label: "Description",
        type: "string",
        description: "Event description"
      },
      {
        name: "location",
        label: "Location",
        type: "string",
        description: "Event location"
      },
      {
        name: "start",
        label: "Start Time",
        type: "object",
        description: "Original event start date and time"
      },
      {
        name: "end",
        label: "End Time",
        type: "object",
        description: "Original event end date and time"
      },
      {
        name: "attendees",
        label: "Attendees",
        type: "array",
        description: "List of event attendees who were invited"
      },
      {
        name: "organizer",
        label: "Organizer",
        type: "object",
        description: "Event organizer information"
      },
      {
        name: "htmlLink",
        label: "Event Link",
        type: "string",
        description: "Link to the event in Google Calendar"
      },
      {
        name: "canceledTime",
        label: "Canceled Time",
        type: "string",
        description: "ISO timestamp when event was canceled"
      },
      {
        name: "status",
        label: "Status",
        type: "string",
        description: "Event status (will be 'cancelled')"
      }
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
      // ========== EVENT TITLE ==========
      {
        name: "title",
        label: "Event Title",
        type: "text",
        placeholder: "Add title",
        required: true
      },

      // ========== ALL DAY TOGGLE ==========
      {
        name: "allDay",
        label: "All day",
        type: "boolean",
        defaultValue: false,
        description: "Event lasts all day"
      },

      // ========== DATE & TIME SECTION ==========
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
        type: "time-picker-15min",
        required: true,
        defaultValue: "09:00",
        hidden: {
          $deps: ["allDay"],
          $condition: { allDay: { $eq: true } }
        }
      },

      {
        name: "endDate",
        label: "End Date",
        type: "date",
        required: true,
        defaultValue: "today"
      },

      {
        name: "endTime",
        label: "End Time",
        type: "time-picker-15min",
        required: true,
        defaultValue: "10:00",
        hidden: {
          $deps: ["allDay"],
          $condition: { allDay: { $eq: true } }
        }
      },

      {
        name: "recurrence",
        label: "Repeat",
        type: "select",
        defaultValue: "none",
        placeholder: "Does not repeat",
        options: [
          { value: "none", label: "Does not repeat" },
          { value: "RRULE:FREQ=DAILY", label: "Daily" },
          { value: "RRULE:FREQ=WEEKLY", label: "Weekly" },
          { value: "RRULE:FREQ=MONTHLY", label: "Monthly" },
          { value: "RRULE:FREQ=YEARLY", label: "Annually" },
          { value: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday (Monday to Friday)" }
        ],
        hidden: {
          $deps: ["allDay"],
          $condition: { allDay: { $eq: true } }
        }
      },

      {
        name: "separateTimezones",
        label: "Use separate start and end time zones",
        type: "boolean",
        defaultValue: false,
        hidden: {
          $deps: ["allDay"],
          $condition: { allDay: { $eq: true } }
        }
      },

      {
        name: "startTimeZone",
        label: "Event Start Time Zone",
        type: "select",
        defaultValue: "America/New_York",
        required: false,
        hidden: {
          $deps: ["allDay"],
          $condition: { allDay: { $eq: true } }
        },
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
        name: "endTimeZone",
        label: "Event End Time Zone",
        type: "select",
        defaultValue: "America/New_York",
        required: false,
        hidden: {
          $deps: ["separateTimezones", "allDay"],
          $condition: {
            $or: [
              { separateTimezones: { $eq: false } },
              { separateTimezones: { $exists: false } },
              { allDay: { $eq: true } }
            ]
          }
        },
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

      // ========== EVENT DETAILS SECTION ==========
      {
        name: "googleMeet",
        label: "Add Google Meet video conferencing",
        type: "google-meet-button",
        defaultValue: null,
        icon: "video",
        buttonText: "Add Google Meet video conferencing",
        description: "Create and manage Google Meet video conference for this event"
      },

      {
        name: "location",
        label: "Add location",
        type: "google-places-autocomplete",
        placeholder: "Enter location or address"
      },

      {
        name: "notifications",
        label: "Notifications",
        type: "notification-builder",
        defaultValue: [
          { method: "popup", minutes: 30 }
        ],
        description: "Add multiple notifications with different timing"
      },

      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        loadOnMount: true,
        required: true,
      },

      {
        name: "colorId",
        label: "Color",
        type: "select",
        defaultValue: "default",
        placeholder: "Calendar color",
        showColorPreview: true,
        options: [
          { value: "default", label: "Calendar color", color: "#808080" },
          { value: "1", label: "Lavender", color: "#a4bdfc" },
          { value: "2", label: "Sage", color: "#7ae7bf" },
          { value: "3", label: "Grape", color: "#dbadff" },
          { value: "4", label: "Flamingo", color: "#ff887c" },
          { value: "5", label: "Banana", color: "#fbd75b" },
          { value: "6", label: "Tangerine", color: "#ffb878" },
          { value: "7", label: "Peacock", color: "#46d6db" },
          { value: "8", label: "Graphite", color: "#e1e1e1" },
          { value: "9", label: "Blueberry", color: "#5484ed" },
          { value: "10", label: "Basil", color: "#51b749" },
          { value: "11", label: "Tomato", color: "#dc2127" }
        ]
      },

      {
        name: "transparency",
        label: "Show as",
        type: "select",
        defaultValue: "opaque",
        options: [
          { value: "transparent", label: "Free" },
          { value: "opaque", label: "Busy" }
        ]
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
        name: "description",
        label: "Add description",
        type: "textarea",
        placeholder: "Add description"
      },

      // ========== GUESTS SECTION ==========
      {
        name: "attendees",
        label: "Add guests",
        type: "contact-picker",
        dynamic: "gmail-recent-recipients",
        loadOnMount: true,
        placeholder: "Type email addresses or names"
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
        visibilityCondition: {
          field: "attendees",
          operator: "equals",
          value: true // Will show when attendees has any truthy value
        }
      },

      {
        name: "guestsCanInviteOthers",
        label: "Guests can invite others",
        type: "boolean",
        defaultValue: true,
        visibilityCondition: {
          field: "attendees",
          operator: "equals",
          value: true // Will show when attendees has any truthy value
        }
      },

      {
        name: "guestsCanSeeOtherGuests",
        label: "Guests can see guest list",
        type: "boolean",
        defaultValue: true,
        visibilityCondition: {
          field: "attendees",
          operator: "equals",
          value: true // Will show when attendees has any truthy value
        }
      },

      {
        name: "guestsCanModify",
        label: "Guests can modify event",
        type: "boolean",
        defaultValue: false,
        visibilityCondition: {
          field: "attendees",
          operator: "equals",
          value: true // Will show when attendees has any truthy value
        }
      }
    ],
    outputSchema: [
      {
        name: "eventId",
        label: "Event ID",
        type: "string",
        description: "Unique identifier for the created event"
      },
      {
        name: "htmlLink",
        label: "Event Link",
        type: "string",
        description: "Direct link to the event in Google Calendar"
      },
      {
        name: "start",
        label: "Start Time",
        type: "object",
        description: "Event start date and time information"
      },
      {
        name: "end",
        label: "End Time",
        type: "object",
        description: "Event end date and time information"
      },
      {
        name: "hangoutLink",
        label: "Hangout Link",
        type: "string",
        description: "Google Meet/Hangouts link if conference was added"
      },
      {
        name: "meetLink",
        label: "Meet Link",
        type: "string",
        description: "Google Meet video conference link"
      },
      {
        name: "attendees",
        label: "Attendees",
        type: "array",
        description: "List of event attendees with their response status"
      },
      {
        name: "status",
        label: "Status",
        type: "string",
        description: "Current status of the event"
      }
    ],
  },
]