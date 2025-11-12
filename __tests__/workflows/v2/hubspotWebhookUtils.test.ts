import {
  buildHubSpotTriggerData,
  shouldSkipByConfig,
  normalizeIdList
} from '@/lib/webhooks/hubspotWebhookUtils'

describe('HubSpot Webhook Utils', () => {
  it('builds ticket trigger payloads', () => {
    const payload = {
      objectId: '123',
      portalId: '999',
      subscriptionId: 'sub',
      occurredAt: '2024-01-01T00:00:00.000Z',
      properties: {
        subject: 'Support',
        content: 'Help me',
        hs_pipeline: 'default',
        hs_pipeline_stage: 'stage',
        hs_ticket_priority: 'HIGH',
        hs_ticket_category: 'Bug',
        hs_ticket_status: 'WAITING_ON_US',
        custom_field: 'custom value',
        hubspot_owner_id: 'owner_1',
        source_type: 'EMAIL',
        createdate: '2024-01-01T00:00:00.000Z'
      }
    }

    const data = buildHubSpotTriggerData(payload, 'ticket.creation')
    expect(data.ticketId).toBe('123')
    expect(data.hs_ticket_priority).toBe('HIGH')
    expect(data.hs_ticket_status).toBe('WAITING_ON_US')
    expect(data.properties?.subject).toBe('Support')
    expect(data.customProperties?.custom_field).toBe('custom value')
  })

  it('builds engagement payloads with associations', () => {
    const payload = {
      objectId: 'note-1',
      properties: {
        hs_note_body: 'hello',
        hubspot_owner_id: 'user_1'
      },
      associations: {
        contacts: ['1', '2'],
        companies: ['3']
      }
    }

    const data = buildHubSpotTriggerData(payload, 'note.creation')
    expect(data.associatedContactIds).toEqual(['1', '2'])
    expect(data.associatedCompanyIds).toEqual(['3'])
  })

  it('filters workflows with shouldSkipByConfig', () => {
    const data = {
      hs_pipeline: 'sales',
      hs_ticket_priority: 'MEDIUM'
    }
    const config = {
      filterByPipeline: 'support',
      filterByPriority: 'MEDIUM'
    }

    expect(shouldSkipByConfig('hubspot_trigger_ticket_created', config, data)).toBe('pipeline filter mismatch')
  })

  it('respects filters when values exist only in properties blob', () => {
    const data = {
      properties: {
        hs_pipeline: 'support',
        hs_ticket_priority: 'LOW'
      }
    }

    const config = {
      filterByPipeline: 'support',
      filterByPriority: 'LOW'
    }

    expect(shouldSkipByConfig('hubspot_trigger_ticket_created', config, data)).toBeNull()
  })

  it('filters form submissions by ID', () => {
    const data = { formId: 'abc' }
    const config = { formId: 'xyz' }
    expect(shouldSkipByConfig('hubspot_trigger_form_submission', config, data)).toBe('form filter mismatch')
  })

  it('normalizes mixed id lists', () => {
    expect(normalizeIdList(['1', 2, null])).toEqual(['1', '2'])
    expect(normalizeIdList('1;2 ; 3')).toEqual(['1', '2', '3'])
    expect(normalizeIdList(undefined)).toEqual([])
  })
})
