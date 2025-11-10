import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a call engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/calls
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/calls
 * - Scopes: crm.objects.contacts.write
 */
export async function hubspotCreateCall(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Optional fields (all calls can be logged without required fields)
    const callTitle = context.dataFlowManager.resolveVariable(config.hs_call_title)
    if (callTitle) {
      properties.hs_call_title = callTitle
    }

    const callBody = context.dataFlowManager.resolveVariable(config.hs_call_body)
    if (callBody) {
      properties.hs_call_body = callBody
    }

    const callDuration = context.dataFlowManager.resolveVariable(config.hs_call_duration)
    if (callDuration) {
      properties.hs_call_duration = callDuration.toString()
    }

    const callDirection = context.dataFlowManager.resolveVariable(config.hs_call_direction)
    if (callDirection) {
      properties.hs_call_direction = callDirection
    }

    const callDisposition = context.dataFlowManager.resolveVariable(config.hs_call_disposition)
    if (callDisposition) {
      properties.hs_call_disposition = callDisposition
    }

    const callStatus = context.dataFlowManager.resolveVariable(config.hs_call_status) || 'COMPLETED'
    properties.hs_call_status = callStatus

    const timestamp = context.dataFlowManager.resolveVariable(config.hs_timestamp)
    if (timestamp) {
      const timestampMs = new Date(timestamp).getTime()
      properties.hs_timestamp = timestampMs.toString()
    } else {
      properties.hs_timestamp = Date.now().toString()
    }

    const ownerId = context.dataFlowManager.resolveVariable(config.hubspot_owner_id)
    if (ownerId) {
      properties.hubspot_owner_id = ownerId
    }

    // Create call
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/calls', {
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

    // Handle associations
    const associatedContactId = context.dataFlowManager.resolveVariable(config.associatedContactId)
    const associatedCompanyId = context.dataFlowManager.resolveVariable(config.associatedCompanyId)
    const associatedDealId = context.dataFlowManager.resolveVariable(config.associatedDealId)
    const associatedTicketId = context.dataFlowManager.resolveVariable(config.associatedTicketId)

    const associations = []
    if (associatedContactId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/calls/${data.id}/associations/contacts/${associatedContactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }])
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/calls/${data.id}/associations/companies/${associatedCompanyId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 182 }])
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/calls/${data.id}/associations/deals/${associatedDealId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 206 }])
        })
      )
    }
    if (associatedTicketId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/calls/${data.id}/associations/tickets/${associatedTicketId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }])
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    return {
      success: true,
      output: {
        callId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties,
        associatedContactId,
        associatedCompanyId,
        associatedDealId,
        associatedTicketId
      },
      message: `Successfully logged call ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Call error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to log call in HubSpot'
    }
  }
}
