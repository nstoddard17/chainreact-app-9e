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
    outputs: [
      { name: "page_path", label: "Page Path", type: "string" },
      { name: "page_title", label: "Page Title", type: "string" },
      { name: "user_id", label: "User ID", type: "string" },
      { name: "session_id", label: "Session ID", type: "string" },
      { name: "timestamp", label: "Timestamp", type: "string" },
      { name: "device_category", label: "Device Category", type: "string" },
      { name: "country", label: "Country", type: "string" },
      { name: "city", label: "City", type: "string" },
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
    outputs: [
      { name: "event_name", label: "Event Name", type: "string" },
      { name: "conversion_value", label: "Conversion Value", type: "number" },
      { name: "user_id", label: "User ID", type: "string" },
      { name: "session_id", label: "Session ID", type: "string" },
      { name: "timestamp", label: "Timestamp", type: "string" },
      { name: "page_path", label: "Page Path", type: "string" },
      { name: "device_category", label: "Device Category", type: "string" },
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
    outputs: [
      { name: "event_name", label: "Event Name", type: "string" },
      { name: "event_params", label: "Event Parameters", type: "object" },
      { name: "user_id", label: "User ID", type: "string" },
      { name: "session_id", label: "Session ID", type: "string" },
      { name: "timestamp", label: "Timestamp", type: "string" },
      { name: "page_path", label: "Page Path", type: "string" },
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
    outputs: [
      { name: "success", label: "Success", type: "boolean" },
      { name: "event_name", label: "Event Name", type: "string" },
      { name: "client_id", label: "Client ID", type: "string" },
      { name: "timestamp", label: "Timestamp", type: "string" },
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
    outputs: [
      { name: "active_users", label: "Active Users", type: "number" },
      { name: "page_views", label: "Page Views", type: "number" },
      { name: "event_count", label: "Event Count", type: "number" },
      { name: "data", label: "Full Data", type: "object" },
      { name: "timestamp", label: "Timestamp", type: "string" },
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
    outputs: [
      { name: "report_data", label: "Report Data", type: "array" },
      { name: "total_rows", label: "Total Rows", type: "number" },
      { name: "date_range", label: "Date Range", type: "object" },
      { name: "metrics", label: "Metrics", type: "array" },
      { name: "dimensions", label: "Dimensions", type: "array" },
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
    outputs: [
      { name: "user_id", label: "User ID", type: "string" },
      { name: "activity", label: "User Activity", type: "array" },
      { name: "total_events", label: "Total Events", type: "number" },
      { name: "total_sessions", label: "Total Sessions", type: "number" },
      { name: "first_seen", label: "First Seen", type: "string" },
      { name: "last_seen", label: "Last Seen", type: "string" },
    ],
  },
]
