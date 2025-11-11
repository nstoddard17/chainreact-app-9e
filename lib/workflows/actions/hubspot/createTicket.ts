import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a new ticket in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tickets
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */
export async function hubspotCreateTicket(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Required fields
    const subject = context.dataFlowManager.resolveVariable(config.subject)
    if (!subject) {
      throw new Error('Ticket subject is required')
    }
    properties.subject = subject

    const pipeline = context.dataFlowManager.resolveVariable(config.hs_pipeline)
    if (!pipeline) {
      throw new Error('Pipeline is required')
    }
    properties.hs_pipeline = pipeline

    const stage = context.dataFlowManager.resolveVariable(config.hs_pipeline_stage)
    if (!stage) {
      throw new Error('Pipeline stage is required')
    }
    properties.hs_pipeline_stage = stage

    // Optional fields
    const optionalFields = [
      'content', 'hs_ticket_priority', 'hs_ticket_category',
      'hubspot_owner_id', 'source_type'
    ]

    optionalFields.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    // Create ticket
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/tickets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Handle associations if provided
    const associatedContactId = context.dataFlowManager.resolveVariable(config.associatedContactId)
    const associatedCompanyId = context.dataFlowManager.resolveVariable(config.associatedCompanyId)
    const associatedDealId = context.dataFlowManager.resolveVariable(config.associatedDealId)

    const associations = []
    if (associatedContactId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/contacts/${associatedContactId}/ticket_to_contact`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/companies/${associatedCompanyId}/ticket_to_company`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${data.id}/associations/deals/${associatedDealId}/ticket_to_deal`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    return {
      success: true,
      output: {
        ticketId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties
      },
      message: `Successfully created ticket ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Ticket error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create ticket in HubSpot'
    }
  }
}
