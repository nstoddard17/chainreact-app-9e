export interface AirtableFieldSchema {
  name: string
  type:
    | 'singleLineText'
    | 'longText'
    | 'singleSelect'
    | 'multipleSelects'
    | 'number'
    | 'email'
    | 'url'
    | 'checkbox'
    | 'date'
    | 'phoneNumber'
    | 'multipleAttachments'
  options?: string[]
  description?: string
}

export interface AirtableTableSchema {
  tableName: string
  description?: string
  fields: AirtableFieldSchema[]
}

export interface TemplateSetupResource {
  name: string
  description?: string
  url: string
  type?: 'csv' | 'template' | 'documentation' | 'video' | 'link'
}

export interface TemplateIntegrationSetupBase {
  type: string
  title?: string
  integration?: string
  instructions?: string[]
  resources?: TemplateSetupResource[]
}

export interface AirtableIntegrationSetup extends TemplateIntegrationSetupBase {
  type: 'airtable'
  baseName: string
  copyUrl?: string
  tables: AirtableTableSchema[]
}

export interface GoogleSheetsIntegrationSetup extends TemplateIntegrationSetupBase {
  type: 'google_sheets'
  spreadsheetName: string
  templateUrl?: string
  sampleSheets?: Array<{
    sheetName: string
    description?: string
    downloadUrl: string
  }>
}

export type TemplateIntegrationSetup =
  | AirtableIntegrationSetup
  | GoogleSheetsIntegrationSetup
  | TemplateIntegrationSetupBase

export interface TemplateSetupOverviewSection {
  title: string
  description?: string
  items?: string[]
}

export interface TemplateSetupOverview {
  summary?: string
  sections?: TemplateSetupOverviewSection[]
  notes?: string | string[]
}

export interface TemplateAsset {
  id: string
  name: string
  asset_type: string
  mime_type?: string
  metadata?: Record<string, any>
  download_url: string
  created_at: string
}

export interface AirtableSetupRequirementResponse extends AirtableIntegrationSetup {
  csvFiles: Array<{
    tableName: string
    filename: string
    downloadUrl: string
  }>
  guideDownloadUrl: string
  instructions: string[]
}

export interface GoogleSheetsSetupRequirementResponse extends GoogleSheetsIntegrationSetup {}

export type TemplateSetupRequirementResponse =
  | AirtableSetupRequirementResponse
  | GoogleSheetsSetupRequirementResponse
  | TemplateIntegrationSetup
