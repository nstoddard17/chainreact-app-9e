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
        hubspot_owner_id: 'user_1',
        hubspot_owner_id__label: 'Owner Name',
        custom_flag: 'yes'
      },
      associations: {
        contacts: ['1', '2'],
        companies: ['3']
      }
    }

    const data = buildHubSpotTriggerData(payload, 'note.creation')
    expect(data.associatedContactIds).toEqual(['1', '2'])
    expect(data.associatedCompanyIds).toEqual(['3'])
    expect(data.customProperties?.custom_flag).toBe('yes')
    expect(data.hubspot_owner_name).toBe('Owner Name')
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

  it('flattens form submission fields into fieldValues', () => {
    const payload = {
      objectId: 'sub-1',
      formId: 'form-1',
      values: [
        { name: 'email', value: 'demo@example.com' },
        { name: 'firstname', value: 'Demo' }
      ],
      properties: {
        formName: 'Demo Form'
      }
    }

    const data = buildHubSpotTriggerData(payload, 'form.submission')
    expect(data.fields?.email).toBe('demo@example.com')
    expect(data.fieldValues?.firstname).toBe('Demo')
    expect(data.submissionValues).toHaveLength(2)
    expect(data.contactEmail).toBe('demo@example.com')
  })

  it('filters engagement triggers when values exist only in properties blob', () => {
    const ownerFilter = {
      filterByOwner: 'owner-1'
    }
    const taskData = {
      properties: {
        hubspot_owner_id: 'owner-1',
        hs_task_priority: 'HIGH',
        hs_task_type: 'CALL'
      }
    }

    expect(shouldSkipByConfig('hubspot_trigger_task_created', ownerFilter, taskData)).toBeNull()
    expect(shouldSkipByConfig('hubspot_trigger_task_created', { filterByPriority: 'HIGH' }, taskData)).toBeNull()
    expect(shouldSkipByConfig('hubspot_trigger_task_created', { filterByType: 'CALL' }, taskData)).toBeNull()

    const callData = {
      properties: {
        hs_call_direction: 'INBOUND',
        hs_call_disposition: 'CONNECTED'
      }
    }

    expect(shouldSkipByConfig('hubspot_trigger_call_created', { filterByDirection: 'INBOUND' }, callData)).toBeNull()
    expect(shouldSkipByConfig('hubspot_trigger_call_created', { filterByDisposition: 'CONNECTED' }, callData)).toBeNull()

    const meetingData = {
      properties: {
        hs_meeting_outcome: 'COMPLETED'
      }
    }
    expect(shouldSkipByConfig('hubspot_trigger_meeting_created', { filterByOutcome: 'COMPLETED' }, meetingData)).toBeNull()
  })

  it('returns mismatch reasons for engagement filters when values differ', () => {
    const taskData = {
      hs_task_priority: 'LOW',
      hs_task_type: 'EMAIL',
      hubspot_owner_id: 'owner-2'
    }

    expect(shouldSkipByConfig('hubspot_trigger_task_created', { filterByPriority: 'HIGH' }, taskData)).toBe('task priority mismatch')
    expect(shouldSkipByConfig('hubspot_trigger_task_created', { filterByType: 'CALL' }, taskData)).toBe('task type mismatch')
    expect(shouldSkipByConfig('hubspot_trigger_note_created', { filterByOwner: 'owner-1' }, taskData)).toBe('owner filter mismatch')

    const callData = {
      hs_call_direction: 'INBOUND',
      hs_call_disposition: 'NO_ANSWER'
    }

    expect(shouldSkipByConfig('hubspot_trigger_call_created', { filterByDirection: 'OUTBOUND' }, callData)).toBe('call direction mismatch')
    expect(shouldSkipByConfig('hubspot_trigger_call_created', { filterByDisposition: 'CONNECTED' }, callData)).toBe('call disposition mismatch')

    const meetingData = {
      hs_meeting_outcome: 'CANCELED'
    }
    expect(shouldSkipByConfig('hubspot_trigger_meeting_created', { filterByOutcome: 'COMPLETED' }, meetingData)).toBe('meeting outcome mismatch')
  })

  it('builds call payload with owner name and custom properties', () => {
    const payload = {
      objectId: 'call-1',
      properties: {
        hs_call_title: 'Check-in',
        hubspot_owner_id: 'owner-3',
        hubspot_owner_id__label: 'Owner Three',
        custom_field: 'value'
      },
      associations: {
        contacts: ['10']
      }
    }

    const data = buildHubSpotTriggerData(payload, 'call.creation')
    expect(data.callId).toBe('call-1')
    expect(data.hubspot_owner_name).toBe('Owner Three')
    expect(data.customProperties?.custom_field).toBe('value')
    expect(data.associatedContactIds).toEqual(['10'])
  })

  it('normalizes mixed id lists', () => {
    expect(normalizeIdList(['1', 2, null])).toEqual(['1', '2'])
    expect(normalizeIdList('1;2 ; 3')).toEqual(['1', '2', '3'])
    expect(normalizeIdList(undefined)).toEqual([])
  })
})
