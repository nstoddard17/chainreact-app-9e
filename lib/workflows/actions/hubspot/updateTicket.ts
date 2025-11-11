import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Update an existing ticket in HubSpot
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/tickets/{ticketId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */
export async function hubspotUpdateTicket(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve ticket ID
    const ticketId = context.dataFlowManager.resolveVariable(config.ticketId)
    if (!ticketId) {
      throw new Error('Ticket ID is required')
    }

    // Build properties object with all non-empty fields
    const properties: any = {}

    const fieldsToUpdate = [
      'subject', 'content', 'hs_pipeline_stage',
      'hs_ticket_priority', 'hs_ticket_category', 'hs_resolution',
      'hubspot_owner_id'
    ]

    fieldsToUpdate.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    // Check if there are any properties to update
    if (Object.keys(properties).length === 0) {
      throw new Error('At least one property must be provided to update')
    }

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/tickets/${ticketId}`, {
      method: 'PATCH',
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

    return {
      success: true,
      output: {
        ticketId: data.id,
        ...data.properties,
        lastmodifieddate: data.updatedAt,
        properties: data.properties
      },
      message: `Successfully updated ticket ${ticketId} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Update Ticket error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update ticket in HubSpot'
    }
  }
}
