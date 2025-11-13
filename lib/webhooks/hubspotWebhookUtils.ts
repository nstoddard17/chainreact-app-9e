import { logger } from '@/lib/utils/logger'

export interface HubSpotTriggerData {
  objectId: string
  portalId?: string
  subscriptionId?: string
  occurredAt: string
  eventId?: string
  properties?: Record<string, any>
  [key: string]: any
}

export function normalizeIdList(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined && item !== '')
      .map(String)
      .filter((item) => item !== 'null' && item !== 'undefined' && item.trim().length > 0)
  }
  if (typeof value === 'string') {
    return value.split(/[;,]/).map((v) => v.trim()).filter(Boolean)
  }
  return []
}

export function buildHubSpotTriggerData(payload: any, subscriptionType: string): HubSpotTriggerData {
  const occurredAt = payload?.occurredAt || new Date().toISOString()
  let data: HubSpotTriggerData = {
    objectId: payload.objectId,
    portalId: payload.portalId,
    subscriptionId: payload.subscriptionId,
    occurredAt,
    eventId: payload.eventId,
    properties: payload.properties || {}
  }

  const props = payload.properties || {}
  const associations = payload.associations || {}

  const resolveOwnerName = () => {
    return props.hubspot_owner_id__label || props.hubspot_owner_name || props.hs_owner_name || props.ownername
  }

  const addAssociations = (target: HubSpotTriggerData) => {
    target.associatedContactIds = normalizeIdList(associations.contacts || props.associatedcontactids)
    target.associatedCompanyIds = normalizeIdList(associations.companies || props.associatedcompanyids)
    target.associatedDealIds = normalizeIdList(associations.deals || props.associateddealids)
    target.associatedTicketIds = normalizeIdList(associations.tickets || props.associatedticketids)
  }

  if (subscriptionType.includes('contact')) {
    data = {
      ...data,
      contactId: payload.objectId,
      email: props.email,
      firstName: props.firstname,
      lastName: props.lastname,
      company: props.company,
      phone: props.phone,
      lifecycleStage: props.lifecyclestage,
      leadStatus: props.hs_lead_status
    }
  } else if (subscriptionType.includes('company')) {
    data = {
      ...data,
      companyId: payload.objectId,
      name: props.name,
      domain: props.domain,
      industry: props.industry,
      city: props.city,
      state: props.state,
      country: props.country,
      numberOfEmployees: props.numberofemployees,
      annualRevenue: props.annualrevenue
    }
  } else if (subscriptionType.includes('deal')) {
    data = {
      ...data,
      dealId: payload.objectId,
      dealName: props.dealname,
      amount: props.amount,
      dealStage: props.dealstage,
      pipeline: props.pipeline,
      closeDate: props.closedate,
      dealType: props.dealtype
    }
  } else if (subscriptionType.includes('ticket')) {
    data = {
      ...data,
      ticketId: payload.objectId,
      subject: props.subject,
      content: props.content,
      hs_pipeline: props.hs_pipeline,
      hs_pipeline_stage: props.hs_pipeline_stage,
      hs_ticket_priority: props.hs_ticket_priority,
      hs_ticket_category: props.hs_ticket_category,
      hs_ticket_status: props.hs_ticket_status,
      hubspot_owner_id: props.hubspot_owner_id,
      source_type: props.source_type,
      createDate: props.createdate || props.createdAt,
      customProperties: { ...props }
    }
    addAssociations(data)
  } else if (subscriptionType.includes('note')) {
    data = {
      ...data,
      noteId: payload.objectId,
      hs_note_body: props.hs_note_body || props.body,
      hs_timestamp: props.hs_timestamp,
      hubspot_owner_id: props.hubspot_owner_id,
      hubspot_owner_name: resolveOwnerName(),
      createDate: props.createdate || props.createdAt,
      customProperties: { ...props }
    }
    addAssociations(data)
  } else if (subscriptionType.includes('task')) {
    data = {
      ...data,
      taskId: payload.objectId,
      hs_task_subject: props.hs_task_subject,
      hs_task_body: props.hs_task_body,
      hs_task_status: props.hs_task_status,
      hs_task_priority: props.hs_task_priority,
      hs_task_type: props.hs_task_type,
      hs_timestamp: props.hs_timestamp,
      hubspot_owner_id: props.hubspot_owner_id,
      hubspot_owner_name: resolveOwnerName(),
      createDate: props.createdate || props.createdAt,
      customProperties: { ...props }
    }
    addAssociations(data)
  } else if (subscriptionType.includes('call')) {
    data = {
      ...data,
      callId: payload.objectId,
      hs_call_title: props.hs_call_title,
      hs_call_body: props.hs_call_body,
      hs_call_duration: props.hs_call_duration,
      hs_call_direction: props.hs_call_direction,
      hs_call_disposition: props.hs_call_disposition,
      hs_call_status: props.hs_call_status,
      hs_timestamp: props.hs_timestamp,
      hubspot_owner_id: props.hubspot_owner_id,
      hubspot_owner_name: resolveOwnerName(),
      createDate: props.createdate || props.createdAt,
      customProperties: { ...props }
    }
    addAssociations(data)
  } else if (subscriptionType.includes('meeting')) {
    data = {
      ...data,
      meetingId: payload.objectId,
      hs_meeting_title: props.hs_meeting_title,
      hs_meeting_body: props.hs_meeting_body,
      hs_meeting_start_time: props.hs_meeting_start_time,
      hs_meeting_end_time: props.hs_meeting_end_time,
      hs_meeting_location: props.hs_meeting_location,
      hs_meeting_outcome: props.hs_meeting_outcome,
      hs_timestamp: props.hs_timestamp,
      hubspot_owner_id: props.hubspot_owner_id,
      hubspot_owner_name: resolveOwnerName(),
      createDate: props.createdate || props.createdAt,
      customProperties: { ...props }
    }
    addAssociations(data)
  } else if (subscriptionType.includes('form')) {
    const formFieldData = normalizeFormFields(payload, props)
    data = {
      ...data,
      submissionId: payload.objectId,
      formId: payload.formId || props.formId,
      formName: props.formName,
      submittedAt: payload.occurredAt || props.submittedAt || data.occurredAt,
      pageUrl: props.pageUrl || props.page_url,
      pageTitle: props.pageTitle || props.page_title,
      contactEmail: props.email || props.contactEmail || formFieldData.fieldValues.email,
      contactId: props.contactId,
      fields: formFieldData.fieldValues,
      fieldValues: formFieldData.fieldValues,
      submissionValues: formFieldData.entries
    }
  }

  if (subscriptionType.includes('propertyChange')) {
    data.propertyName = payload.propertyName
    data.propertyValue = payload.propertyValue
    data.previousValue = payload.previousPropertyValue
  }

  return data
}

function normalizeFormFields(payload: any, props: Record<string, any>) {
  const fieldValues: Record<string, any> = {}
  const entries: Array<{ name: string; value: any }> = []

  const addEntry = (name?: string, value?: any) => {
    if (!name) return
    const trimmed = String(name).trim()
    if (!trimmed) return
    if (!(trimmed in fieldValues)) {
      fieldValues[trimmed] = value
    }
    entries.push({ name: trimmed, value })
  }

  const processSource = (source: any) => {
    if (!source) return
    if (Array.isArray(source)) {
      source.forEach(item => {
        if (item && typeof item === 'object') {
          addEntry(item.name || item.fieldName || item.inputName, item.value ?? item.inputValue)
        }
      })
      return
    }
    if (typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => addEntry(key, value))
    }
  }

  const candidateSources = [
    payload.values,
    payload.fields,
    props.fields,
    props.formFields,
    props.values,
    props.submissionValues
  ]

  candidateSources.forEach(processSource)

  return { fieldValues, entries }
}

export function shouldSkipByConfig(triggerType: string, config: Record<string, any> = {}, data: Record<string, any>): string | null {
  const matchFilter = (filterValue?: string | null, actual?: string | null) => {
    if (!filterValue) return true
    return (actual || '') === filterValue
  }

  if (triggerType.startsWith('hubspot_trigger_ticket')) {
    if (!matchFilter(config.filterByPipeline, data.hs_pipeline || data.properties?.hs_pipeline)) {
      return 'pipeline filter mismatch'
    }
    if (!matchFilter(config.filterByPriority, data.hs_ticket_priority || data.properties?.hs_ticket_priority)) {
      return 'priority filter mismatch'
    }
  }

  if (triggerType === 'hubspot_trigger_note_created' || triggerType === 'hubspot_trigger_call_created' ||
      triggerType === 'hubspot_trigger_meeting_created' || triggerType === 'hubspot_trigger_task_created') {
    if (!matchFilter(config.filterByOwner, data.hubspot_owner_id || data.properties?.hubspot_owner_id)) {
      return 'owner filter mismatch'
    }
  }

  if (triggerType === 'hubspot_trigger_task_created') {
    if (!matchFilter(config.filterByPriority, data.hs_task_priority || data.properties?.hs_task_priority)) {
      return 'task priority mismatch'
    }
    if (!matchFilter(config.filterByType, data.hs_task_type || data.properties?.hs_task_type)) {
      return 'task type mismatch'
    }
  }

  if (triggerType === 'hubspot_trigger_call_created') {
    if (!matchFilter(config.filterByDirection, data.hs_call_direction || data.properties?.hs_call_direction)) {
      return 'call direction mismatch'
    }
    if (!matchFilter(config.filterByDisposition, data.hs_call_disposition || data.properties?.hs_call_disposition)) {
      return 'call disposition mismatch'
    }
  }

  if (triggerType === 'hubspot_trigger_meeting_created') {
    if (!matchFilter(config.filterByOutcome, data.hs_meeting_outcome || data.properties?.hs_meeting_outcome)) {
      return 'meeting outcome mismatch'
    }
  }

  if (triggerType === 'hubspot_trigger_form_submission') {
    if (!matchFilter(config.formId, data.formId)) {
      return 'form filter mismatch'
    }
  }

  return null
}

const reportedUnsupportedSubscriptions = new Set<string>()

export async function logUnsupportedEvent(subscriptionType: string, payload?: any) {
  logger.warn('[HubSpotWebhook] Unsupported subscription type received', { subscriptionType })

  if (reportedUnsupportedSubscriptions.has(subscriptionType)) {
    return
  }

  reportedUnsupportedSubscriptions.add(subscriptionType)

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const eventData = {
      subscriptionType,
      objectId: payload?.objectId,
      portalId: payload?.portalId,
      occurredAt: payload?.occurredAt,
      propertyKeys: payload?.properties ? Object.keys(payload.properties) : undefined
    }

    await supabase.from('webhook_events').insert({
      provider: 'hubspot',
      request_id: `${subscriptionType}-${payload?.objectId ?? Date.now()}`,
      status: 'unsupported_subscription',
      service: 'hubspot_webhook_monitor',
      event_data: eventData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('[HubSpotWebhook] Failed to persist unsupported subscription event', {
      subscriptionType,
      error: (error as Error)?.message
    })
  }
}

const SAMPLE_EVENT_TYPES = new Set([
  'note.creation',
  'task.creation',
  'call.creation',
  'meeting.creation',
  'form.submission'
])

const loggedSamples = new Set<string>()

export function logWebhookSample(subscriptionType: string, payload: any) {
  if (!SAMPLE_EVENT_TYPES.has(subscriptionType)) return
  if (loggedSamples.has(subscriptionType)) return
  loggedSamples.add(subscriptionType)

  const sanitized = {
    subscriptionType,
    objectId: payload?.objectId,
    portalId: payload?.portalId,
    occurredAt: payload?.occurredAt,
    properties: payload?.properties ? summarizeProperties(payload.properties) : undefined,
    associations: payload?.associations ? summarizeAssociations(payload.associations) : undefined
  }

  logger.info('[HubSpotWebhook] Sample event captured', sanitized)
}

function summarizeProperties(props: Record<string, any>) {
  const summary: Record<string, any> = {}
  const keys = Object.keys(props || {})
  keys.slice(0, 25).forEach((key) => {
    summary[key] = props[key]
  })
  if (keys.length > 25) {
    summary.__truncatedKeys = keys.slice(25)
  }
  return summary
}

function summarizeAssociations(associations: Record<string, any>) {
  const summary: Record<string, any> = {}
  for (const key of Object.keys(associations || {})) {
    const ids = associations[key]
    if (Array.isArray(ids)) {
      summary[key] = ids.slice(0, 10)
      if (ids.length > 10) summary[key].push('...')
    }
  }
  return summary
}
