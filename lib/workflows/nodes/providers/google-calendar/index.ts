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
      // Calendar Section
      {
        name: "calendarId",
        label: "Calendar",
        type: "select",
        dynamic: "google-calendars",
        loadOnMount: true,
        required: true,
      },

      // General Section
      {
        name: "title",
        label: "Event Title",
        type: "text",
        placeholder: "Add title",
        required: true
      },
      {
        name: "description",
        label: "Add description",
        type: "textarea",
        placeholder: "Add description"
      },

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

      // Time Zone
      {
        name: "timeZone",
        label: "Time Zone",
        type: "select",
        defaultValue: "user-timezone",
        required: false,
        options: [
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
        ],
        description: "Your timezone will be automatically detected and set as the default"
      },

      // Other Fields
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