/**
 * Airtable Integration Types
 */

export interface AirtableIntegration {
  id: string
  user_id: string
  provider: 'airtable'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface AirtableBase {
  id: string
  name: string
  permissionLevel: string
}

export interface AirtableTable {
  id: string
  name: string
  description?: string
  primaryFieldId: string
  fields: AirtableField[]
  views: AirtableView[]
}

export interface AirtableField {
  id: string
  name: string
  type: string
  description?: string
  options?: any
}

export interface AirtableView {
  id: string
  name: string
  type: string
}

export interface AirtableRecord {
  id: string
  createdTime: string
  fields: {
    [key: string]: any
  }
}

export interface AirtableFeedbackRecord {
  id: string
  createdTime: string
  fields: {
    Name?: string
    Email?: string
    Feedback?: string
    Status?: string
    Priority?: string
    Type?: string
    'Date Submitted'?: string
    [key: string]: any
  }
}

export interface AirtableTaskRecord {
  id: string
  createdTime: string
  fields: {
    Name?: string
    Status?: string
    Assignee?: string
    'Due Date'?: string
    Priority?: string
    Description?: string
    Project?: string[]
    Tags?: string[]
    [key: string]: any
  }
}

export interface AirtableProjectRecord {
  id: string
  createdTime: string
  fields: {
    Name?: string
    Status?: string
    'Start Date'?: string
    'End Date'?: string
    Description?: string
    'Project Manager'?: string
    Budget?: number
    Progress?: number
    [key: string]: any
  }
}

export interface AirtableApiError extends Error {
  status?: number
  code?: string
}

export interface AirtableDataHandler<T = any> {
  (integration: AirtableIntegration, options?: any): Promise<T[]>
}

export interface AirtableHandlerOptions {
  baseId?: string
  tableName?: string
  maxRecords?: number
  view?: string
  filterByFormula?: string
  sort?: Array<{
    field: string
    direction: 'asc' | 'desc'
  }>
  [key: string]: any
}