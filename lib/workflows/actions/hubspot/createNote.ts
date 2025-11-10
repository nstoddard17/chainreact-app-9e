import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a note engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/notes
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/notes
 * - Scopes: crm.objects.contacts.write
 */
export async function hubspotCreateNote(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Required field
    const noteBody = context.dataFlowManager.resolveVariable(config.hs_note_body)
    if (!noteBody) {
      throw new Error('Note content is required')
    }
    properties.hs_note_body = noteBody

    // Optional fields
    const timestamp = context.dataFlowManager.resolveVariable(config.hs_timestamp)
    if (timestamp) {
      // Convert to milliseconds timestamp if it's an ISO string
      const timestampMs = new Date(timestamp).getTime()
      properties.hs_timestamp = timestampMs.toString()
    } else {
      properties.hs_timestamp = Date.now().toString()
    }

    const ownerId = context.dataFlowManager.resolveVariable(config.hubspot_owner_id)
    if (ownerId) {
      properties.hubspot_owner_id = ownerId
    }

    // Create note
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
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
    const associatedTicketId = context.dataFlowManager.resolveVariable(config.associatedTicketId)

    const associations = []
    if (associatedContactId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/notes/${data.id}/associations/contacts/${associatedContactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }])
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/notes/${data.id}/associations/companies/${associatedCompanyId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }])
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/notes/${data.id}/associations/deals/${associatedDealId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }])
        })
      )
    }
    if (associatedTicketId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/notes/${data.id}/associations/tickets/${associatedTicketId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 218 }])
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    return {
      success: true,
      output: {
        noteId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties,
        associatedContactId,
        associatedCompanyId,
        associatedDealId,
        associatedTicketId
      },
      message: `Successfully created note ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Note error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create note in HubSpot'
    }
  }
}
