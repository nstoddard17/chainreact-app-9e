import { ComponentType } from "react"

export interface ConfigField {
  name: string
  label: string
  type: "string" | "number" | "boolean" | "select" | "combobox" | "textarea" | "text" | "email" | "password" | "email-autocomplete" | "location-autocomplete" | "file" | "date" | "time" | "datetime" | "custom" | "rich-text" | "email-rich-text" | "discord-rich-text" | "multi-select"
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[] | string[]
  dynamic?: "slack_channels" | "slack_workspaces" | "slack_users" | "google-calendars" | "google-contacts" | "google-drive-folders" | "google-drive-files" | "google-docs-documents" | "onedrive-folders" | "dropbox-folders" | "box-folders" | "gmail-recent-recipients" | "gmail-enhanced-recipients" | "gmail-contact-groups" | "gmail_messages" | "gmail_labels" | "gmail_recent_senders" | "gmail_signatures" | "google-sheets_spreadsheets" | "google-sheets_sheets" | "google-sheets_columns" | "youtube_channels" | "youtube_videos" | "youtube_playlists" | "teams_chats" | "teams_teams" | "teams_channels" | "github_repositories" | "gitlab_projects" | "notion_databases" | "notion_pages" | "notion_workspaces" | "notion_users" | "trello_boards" | "trello_lists" | "trello_cards" | "trello_card_templates" | "twitter_mentions" | "hubspot_companies" | "hubspot_contacts" | "hubspot_deals" | "hubspot_lists" | "hubspot_pipelines" | "hubspot_deal_stages" | "hubspot_job_titles" | "hubspot_departments" | "hubspot_industries" | "airtable_workspaces" | "airtable_bases" | "airtable_tables" | "airtable_records" | "airtable_feedback_records" | "airtable_task_records" | "airtable_project_records" | "gumroad_products" | "blackbaud_constituents" | "facebook_pages" | "facebook_conversations" | "facebook_posts" | "onenote_notebooks" | "onenote_sections" | "onenote_pages" | "outlook_folders" | "outlook_messages" | "outlook_contacts" | "outlook_calendars" | "outlook_events" | "outlook-enhanced-recipients" | "discord_guilds" | "discord_channels" | "discord_categories" | "discord_members" | "discord_roles" | "discord_messages" | "discord_users" | "discord_banned_users"
  accept?: string // For file inputs, specify accepted file types
  maxSize?: number // For file inputs, specify max file size in bytes
  defaultValue?: string | number | boolean // Default value for the field
  tableName?: string // For Airtable record fields, specify which table to fetch records from
  uiTab?: "basic" | "advanced" | "monetization" // For tabbed interfaces, specify which tab this field should appear in
  defaultOptions?: { value: string; label: string }[] // Default options for select fields
  [key: string]: any
}

export interface NodeField {
  name: string
  label: string
  type: "text" | "textarea" | "number" | "boolean" | "select" | "combobox" | "file" | "custom" | "email" | "time" | "datetime" | "email-autocomplete" | "date" | "location-autocomplete" | "rich-text" | "email-rich-text" | "discord-rich-text" | "multi-select" | "button-toggle" | "daterange" | "google_sheets_column_mapper" | "google_sheets_condition_builder" | "google_sheets_data_preview" | "array" | "json" | "hidden"
  required?: boolean
  placeholder?: string
  defaultValue?: any
  options?: { value: string; label: string }[] | string[]
  description?: string
  dependsOn?: string
  // Additional properties used in the codebase
  accept?: string
  dynamic?: boolean | string
  maxSize?: string | number
  multiple?: boolean
  creatable?: boolean
  readonly?: boolean
  hidden?: boolean
  // Value constraints
  min?: number
  max?: number
  // UI organization properties
  uiTab?: "basic" | "advanced" | "monetization"
  defaultOptions?: { value: string; label: string }[]
  // New field for output data descriptions
  outputType?: "string" | "number" | "array" | "object" | "boolean"
  // Variable picker support
  hasVariablePicker?: boolean
  // Additional UI properties
  advanced?: boolean
  provider?: string
  createNewText?: string
  showManageButton?: boolean
  conditional?: { field: string; value: any }
  showWhen?: { [key: string]: any }
  showIf?: (values: any) => boolean
  helpText?: string
}

export interface NodeOutputField {
  name: string
  label: string
  type: "string" | "number" | "array" | "object" | "boolean" | "file"
  description: string
  example?: any
}

export interface NodeComponent {
  type: string
  title: string
  description: string
  icon?: ComponentType<any>
  category: string
  providerId?: string
  isTrigger?: boolean
  configSchema?: NodeField[]
  // Additional properties used in the codebase
  triggerType?: string
  payloadSchema?: any
  requiredScopes?: string[]
  actionParamsSchema?: any
  // New properties for data flow and testing
  outputSchema?: NodeOutputField[]
  testable?: boolean
  // Test function that returns sample output data
  testFunction?: (config: any) => Promise<any> | any
  // Conditional availability based on trigger
  requiresTriggerProvider?: string
  // New property to identify nodes that produce outputs suitable for AI Agent input
  producesOutput?: boolean
  // New property to mark actions as coming soon
  comingSoon?: boolean
}