import { ComponentType } from "react"
import { LucideIcon } from "lucide-react"

export interface ConfigField {
  name: string
  label: string
  type: string // Allow any field type for maximum flexibility
  required?: boolean
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[] | string[]
  dynamic?: string | boolean // Allow any dynamic field identifier
  accept?: string // For file inputs, specify accepted file types
  maxSize?: number // For file inputs, specify max file size in bytes
  defaultValue?: string | number | boolean // Default value for the field
  tableName?: string // For Airtable record fields, specify which table to fetch records from
  uiTab?: "basic" | "advanced" | "monetization" // For tabbed interfaces, specify which tab this field should appear in
  defaultOptions?: { value: string; label: string }[] // Default options for select fields
  dependsOn?: string // Field that this field depends on
  hasVariablePicker?: boolean // Whether the field should show a variable picker
  multiline?: boolean // For text fields, whether to show as multiline
  useRawPayload?: boolean // For Discord rich text, whether to use raw payload
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

export interface OutputField {
  name: string
  label: string
  type: string
  description: string
  example?: any
}

export interface NodeComponent {
  type: string
  title: string
  description: string
  icon?: LucideIcon | ComponentType<any> | any // Optional for flexibility
  category?: string // Optional for flexibility
  providerId?: string // Optional for some system nodes
  isTrigger: boolean
  configSchema?: ConfigField[] // Optional, defaults to empty array
  outputSchema?: OutputField[]
  requiredScopes?: string[]
  testable?: boolean
  producesOutput?: boolean
  hideInActionSelection?: boolean
  isSystemNode?: boolean
  supportsWebhook?: boolean
  webhookConfig?: {
    method: "GET" | "POST" | "PUT" | "DELETE"
    responseFormat?: "json" | "text" | "xml"
  }
  tags?: string[]
  version?: string
  deprecated?: boolean
  replacedBy?: string
  triggerType?: string
  payloadSchema?: any
  actionParamsSchema?: any
  comingSoon?: boolean
  supportsChains?: boolean
  recommendedTimeoutMs?: number
}
