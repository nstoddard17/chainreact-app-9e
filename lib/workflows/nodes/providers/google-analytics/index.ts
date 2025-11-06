import { BarChart3, TrendingUp, Users, Activity, Eye, FileBarChart } from "lucide-react"
import { NodeComponent } from "../../types"

/**
 * Google Analytics 4 Integration
 *
 * Triggers:
 * - New Page View
 * - Goal Completion
 * - New Event
 *
 * Actions:
 * - Send Event
 * - Get Real-Time Data
 * - Run Report
 * - Get User Activity
 */

export const googleAnalyticsNodes: NodeComponent[] = [
  // ============================================================================
  // TRIGGERS
  // ============================================================================
  {
    type: "google_analytics_trigger_new_pageview",
    title: "New Page View",
    description: "Triggers when a new page view is recorded (requires Google Analytics 4)",
    icon: Eye,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "pagePath",
        label: "Page Path Filter (Optional)",
        type: "text",
        required: false,
        placeholder: "/blog/*",
        description: "Only trigger for specific pages (e.g., /blog/* for all blog posts)"
      },
    ],
    outputSchema: [
      { name: "page_path", label: "Page Path", type: "string", description: "The path of the page that was viewed" },
      { name: "page_title", label: "Page Title", type: "string", description: "The title of the page" },
      { name: "user_id", label: "User ID", type: "string", description: "Unique identifier for the user" },
      { name: "session_id", label: "Session ID", type: "string", description: "Unique identifier for the session" },
      { name: "timestamp", label: "Timestamp", type: "string", description: "ISO timestamp when the page view occurred" },
      { name: "device_category", label: "Device Category", type: "string", description: "Device type (desktop, mobile, tablet)" },
      { name: "country", label: "Country", type: "string", description: "Country of the user" },
      { name: "city", label: "City", type: "string", description: "City of the user" },
    ],
  },
  {
    type: "google_analytics_trigger_goal_completion",
    title: "Goal Completion",
    description: "Triggers when a conversion goal is completed",
    icon: TrendingUp,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "conversionEvent",
        label: "Conversion Event",
        type: "select",
        dynamic: "google-analytics_conversion_events",
        required: true,
        dependsOn: "propertyId",
        placeholder: "Select a conversion event",
        description: "The specific conversion event to monitor"
      },
    ],
    outputSchema: [
      { name: "event_name", label: "Event Name", type: "string", description: "Name of the conversion event" },
      { name: "conversion_value", label: "Conversion Value", type: "number", description: "Monetary value of the conversion" },
      { name: "user_id", label: "User ID", type: "string", description: "Unique identifier for the user who converted" },
      { name: "session_id", label: "Session ID", type: "string", description: "Session ID where conversion occurred" },
      { name: "timestamp", label: "Timestamp", type: "string", description: "ISO timestamp when the conversion happened" },
      { name: "page_path", label: "Page Path", type: "string", description: "Page where the conversion occurred" },
      { name: "device_category", label: "Device Category", type: "string", description: "Device type (desktop, mobile, tablet)" },
    ],
  },
  {
    type: "google_analytics_trigger_new_event",
    title: "New Event",
    description: "Triggers when a custom event is tracked",
    icon: Activity,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: true,
    producesOutput: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "eventName",
        label: "Event Name",
        type: "text",
        required: true,
        placeholder: "button_click",
        description: "The name of the event to monitor (e.g., 'purchase', 'sign_up')"
      },
    ],
    outputSchema: [
      { name: "event_name", label: "Event Name", type: "string", description: "Name of the custom event that was tracked" },
      { name: "event_params", label: "Event Parameters", type: "object", description: "Custom parameters attached to the event" },
      { name: "user_id", label: "User ID", type: "string", description: "Unique identifier for the user" },
      { name: "session_id", label: "Session ID", type: "string", description: "Session ID where event occurred" },
      { name: "timestamp", label: "Timestamp", type: "string", description: "ISO timestamp when the event was tracked" },
      { name: "page_path", label: "Page Path", type: "string", description: "Page where the event occurred" },
    ],
  },

  // ============================================================================
  // ACTIONS
  // ============================================================================
  {
    type: "google_analytics_action_send_event",
    title: "Send Event",
    description: "Send a custom event to Google Analytics 4",
    icon: TrendingUp,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.edit"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "measurementId",
        label: "Measurement ID",
        type: "select",
        dynamic: "google-analytics_measurement_ids",
        required: true,
        dependsOn: "propertyId",
        placeholder: "Select measurement ID",
        description: "The measurement ID for your property (e.g., G-XXXXXXXXXX)"
      },
      {
        name: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
        placeholder: "{{trigger.user_id}}",
        description: "Unique identifier for the client/user",
        supportsAI: true,
      },
      {
        name: "eventName",
        label: "Event Name",
        type: "text",
        required: true,
        placeholder: "purchase",
        description: "Name of the event (e.g., 'purchase', 'sign_up', 'add_to_cart')",
        supportsAI: true,
      },
      {
        name: "eventParams",
        label: "Event Parameters",
        type: "object",
        required: false,
        placeholder: JSON.stringify({ currency: "USD", value: 99.99 }, null, 2),
        description: "Additional parameters for the event (JSON object)",
        supportsAI: true,
      },
      {
        name: "userId",
        label: "User ID (Optional)",
        type: "text",
        required: false,
        placeholder: "{{trigger.email}}",
        description: "Optional user identifier for cross-platform tracking",
        supportsAI: true,
      },
    ],
    outputSchema: [
      {
        name: "success",
        label: "Success",
        type: "boolean",
        description: "Whether the event was successfully sent to Google Analytics",
        example: true
      },
      {
        name: "event_name",
        label: "Event Name",
        type: "string",
        description: "The name of the event that was sent",
        example: "purchase"
      },
      {
        name: "client_id",
        label: "Client ID",
        type: "string",
        description: "The client ID used to send the event",
        example: "123456.7890123456"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO 8601 timestamp when the event was sent",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "google_analytics_action_get_realtime_data",
    title: "Get Real-Time Data",
    description: "Fetch real-time analytics data for your property",
    icon: BarChart3,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "metrics",
        label: "Metrics",
        type: "multi-select",
        required: true,
        options: [
          { label: "Active Users", value: "activeUsers" },
          { label: "Screen Page Views", value: "screenPageViews" },
          { label: "Event Count", value: "eventCount" },
          { label: "Conversions", value: "conversions" },
        ],
        defaultValue: ["activeUsers"],
        description: "The metrics to retrieve"
      },
      {
        name: "dimensions",
        label: "Dimensions (Optional)",
        type: "multi-select",
        required: false,
        options: [
          { label: "Country", value: "country" },
          { label: "City", value: "city" },
          { label: "Device Category", value: "deviceCategory" },
          { label: "Page Path", value: "pagePath" },
          { label: "Event Name", value: "eventName" },
        ],
        description: "Optional dimensions to group the data by"
      },
    ],
    outputSchema: [
      {
        name: "active_users",
        label: "Active Users",
        type: "number",
        description: "Number of users currently active on your site",
        example: 127
      },
      {
        name: "page_views",
        label: "Page Views",
        type: "number",
        description: "Total page views in the specified time period",
        example: 1543
      },
      {
        name: "event_count",
        label: "Event Count",
        type: "number",
        description: "Total number of events tracked",
        example: 892
      },
      {
        name: "data",
        label: "Full Data",
        type: "object",
        description: "Complete real-time data response including all metrics and dimensions",
        example: { rows: [], totals: {}, metadata: {} }
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO 8601 timestamp when the data was fetched",
        example: "2024-01-15T10:30:00Z"
      },
    ],
  },
  {
    type: "google_analytics_action_run_report",
    title: "Run Report",
    description: "Run a custom analytics report with specified metrics and dimensions",
    icon: FileBarChart,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "dateRange",
        label: "Date Range",
        type: "select",
        required: true,
        options: [
          { label: "Today", value: "today" },
          { label: "Yesterday", value: "yesterday" },
          { label: "Last 7 Days", value: "last_7_days" },
          { label: "Last 30 Days", value: "last_30_days" },
          { label: "Last 90 Days", value: "last_90_days" },
          { label: "This Month", value: "this_month" },
          { label: "Last Month", value: "last_month" },
          { label: "Custom", value: "custom" },
        ],
        defaultValue: "last_7_days",
        description: "The date range for the report"
      },
      {
        name: "startDate",
        label: "Start Date",
        type: "text",
        required: false,
        placeholder: "2024-01-01",
        description: "Custom start date (YYYY-MM-DD) - only if date range is 'Custom'",
        showIf: { field: "dateRange", value: "custom" },
        supportsAI: true,
      },
      {
        name: "endDate",
        label: "End Date",
        type: "text",
        required: false,
        placeholder: "2024-01-31",
        description: "Custom end date (YYYY-MM-DD) - only if date range is 'Custom'",
        showIf: { field: "dateRange", value: "custom" },
        supportsAI: true,
      },
      {
        name: "metrics",
        label: "Metrics",
        type: "multi-select",
        required: true,
        options: [
          { label: "Sessions", value: "sessions" },
          { label: "Total Users", value: "totalUsers" },
          { label: "New Users", value: "newUsers" },
          { label: "Screen Page Views", value: "screenPageViews" },
          { label: "Conversions", value: "conversions" },
          { label: "Engagement Rate", value: "engagementRate" },
          { label: "Bounce Rate", value: "bounceRate" },
          { label: "Average Session Duration", value: "averageSessionDuration" },
        ],
        defaultValue: ["sessions", "totalUsers"],
        description: "The metrics to include in the report"
      },
      {
        name: "dimensions",
        label: "Dimensions",
        type: "multi-select",
        required: false,
        options: [
          { label: "Date", value: "date" },
          { label: "Country", value: "country" },
          { label: "City", value: "city" },
          { label: "Device Category", value: "deviceCategory" },
          { label: "Page Path", value: "pagePath" },
          { label: "Source", value: "source" },
          { label: "Medium", value: "medium" },
          { label: "Campaign", value: "campaign" },
        ],
        description: "Optional dimensions to group the data by"
      },
      {
        name: "limit",
        label: "Row Limit",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "100",
        description: "Maximum number of rows to return (default: 100)"
      },
    ],
    outputSchema: [
      {
        name: "report_data",
        label: "Report Data",
        type: "array",
        description: "Array of report rows containing metrics and dimensions for each data point",
        example: [{ date: "20240115", sessions: 1234, totalUsers: 567 }]
      },
      {
        name: "total_rows",
        label: "Total Rows",
        type: "number",
        description: "Total number of rows in the report",
        example: 45
      },
      {
        name: "date_range",
        label: "Date Range",
        type: "object",
        description: "Object containing the start and end dates used for the report",
        example: { startDate: "2024-01-01", endDate: "2024-01-31" }
      },
      {
        name: "metrics",
        label: "Metrics",
        type: "array",
        description: "Array of metric names included in the report",
        example: ["sessions", "totalUsers", "screenPageViews"]
      },
      {
        name: "dimensions",
        label: "Dimensions",
        type: "array",
        description: "Array of dimension names used to group the data",
        example: ["date", "country", "deviceCategory"]
      },
    ],
  },
  {
    type: "google_analytics_action_get_user_activity",
    title: "Get User Activity",
    description: "Retrieve activity data for a specific user",
    icon: Users,
    providerId: "google-analytics",
    category: "Analytics",
    isTrigger: false,
    producesOutput: true,
    testable: true,
    requiredScopes: [
      "https://www.googleapis.com/auth/analytics.readonly"
    ],
    configSchema: [
      {
        name: "propertyId",
        label: "GA4 Property",
        type: "select",
        dynamic: "google-analytics_properties",
        required: true,
        loadOnMount: true,
        placeholder: "Select a property",
        description: "Choose a Google Analytics 4 property"
      },
      {
        name: "userId",
        label: "User ID",
        type: "text",
        required: true,
        placeholder: "{{trigger.user_id}}",
        description: "The user ID to look up",
        supportsAI: true,
      },
      {
        name: "dateRange",
        label: "Date Range",
        type: "select",
        required: true,
        options: [
          { label: "Last 7 Days", value: "last_7_days" },
          { label: "Last 30 Days", value: "last_30_days" },
          { label: "Last 90 Days", value: "last_90_days" },
        ],
        defaultValue: "last_30_days",
        description: "How far back to look for user activity"
      },
    ],
    outputSchema: [
      {
        name: "user_id",
        label: "User ID",
        type: "string",
        description: "The user ID that was queried",
        example: "user_12345"
      },
      {
        name: "activity",
        label: "User Activity",
        type: "array",
        description: "Array of user activity events including pages visited, events triggered, and timestamps",
        example: [{ eventName: "page_view", pagePath: "/home", timestamp: "2024-01-15T10:30:00Z" }]
      },
      {
        name: "total_events",
        label: "Total Events",
        type: "number",
        description: "Total number of events recorded for this user in the specified date range",
        example: 47
      },
      {
        name: "total_sessions",
        label: "Total Sessions",
        type: "number",
        description: "Total number of sessions for this user in the specified date range",
        example: 12
      },
      {
        name: "first_seen",
        label: "First Seen",
        type: "string",
        description: "ISO 8601 timestamp of when this user was first seen",
        example: "2023-12-01T08:15:00Z"
      },
      {
        name: "last_seen",
        label: "Last Seen",
        type: "string",
        description: "ISO 8601 timestamp of when this user was last seen",
        example: "2024-01-15T14:22:00Z"
      },
    ],
  },
]
