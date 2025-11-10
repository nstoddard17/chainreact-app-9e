/**
 * HubSpot Integration Types
 */

export interface HubSpotIntegration {
  id: string
  user_id: string
  provider: 'hubspot'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface HubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
    city?: string
    state?: string
    country?: string
    industry?: string
    phone?: string
    website?: string
    createdate?: string
    hs_lastmodifieddate?: string
    numberofemployees?: string
    annualrevenue?: string
    description?: string
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    company?: string
    jobtitle?: string
    city?: string
    state?: string
    country?: string
    createdate?: string
    lastmodifieddate?: string
    hs_lead_status?: string
    lifecyclestage?: string
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname?: string
    dealstage?: string
    pipeline?: string
    amount?: string
    closedate?: string
    createdate?: string
    hs_lastmodifieddate?: string
    hubspot_owner_id?: string
    dealtype?: string
    description?: string
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotList {
  listId: string
  name: string
  size: number
  listType: string
  createdAt: string
  updatedAt: string
  dynamic: boolean
  processing: string
}

export interface HubSpotPipeline {
  id: string
  label: string
  displayOrder: number
  stages: HubSpotDealStage[]
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotDealStage {
  id: string
  label: string
  displayOrder: number
  probability: number
  closed: boolean
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotTicket {
  id: string
  properties: {
    subject?: string
    content?: string
    hs_pipeline?: string
    hs_pipeline_stage?: string
    hs_ticket_priority?: string
    hs_ticket_category?: string
    hubspot_owner_id?: string
    source_type?: string
    hs_resolution?: string
    createdate?: string
    hs_lastmodifieddate?: string
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotTicketStage {
  id: string
  label: string
  displayOrder: number
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotProperty {
  name: string
  label: string
  type: string
  fieldType: string
  description?: string
  groupName?: string
  options?: Array<{
    label: string
    value: string
    displayOrder: number
  }>
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface HubSpotJobTitle {
  id: string
  label: string
  value: string
  displayOrder: number
}

export interface HubSpotDepartment {
  id: string
  label: string
  value: string
  displayOrder: number
}

export interface HubSpotIndustry {
  id: string
  label: string
  value: string
  displayOrder: number
}

export interface HubSpotApiError extends Error {
  status?: number
  code?: string
}

export interface HubSpotDataHandler<T = any> {
  (integration: HubSpotIntegration, options?: any): Promise<T[]>
}

export interface HubSpotHandlerOptions {
  pipeline?: string
  baseId?: string
  limit?: number
  [key: string]: any
}