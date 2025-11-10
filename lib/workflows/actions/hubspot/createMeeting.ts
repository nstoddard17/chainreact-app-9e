import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a meeting engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/meetings
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/meetings
 * - Scopes: crm.objects.contacts.write
 */
export async function hubspotCreateMeeting(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Required field
    const meetingTitle = context.dataFlowManager.resolveVariable(config.hs_meeting_title)
    if (!meetingTitle) {
      throw new Error('Meeting title is required')
    }
    properties.hs_meeting_title = meetingTitle

    // Optional fields
    const meetingBody = context.dataFlowManager.resolveVariable(config.hs_meeting_body)
    if (meetingBody) {
      properties.hs_meeting_body = meetingBody
    }

    const meetingStartTime = context.dataFlowManager.resolveVariable(config.hs_meeting_start_time)
    if (meetingStartTime) {
      const startTimeMs = new Date(meetingStartTime).getTime()
      properties.hs_meeting_start_time = startTimeMs.toString()
    }

    const meetingEndTime = context.dataFlowManager.resolveVariable(config.hs_meeting_end_time)
    if (meetingEndTime) {
      const endTimeMs = new Date(meetingEndTime).getTime()
      properties.hs_meeting_end_time = endTimeMs.toString()
    }

    const meetingLocation = context.dataFlowManager.resolveVariable(config.hs_meeting_location)
    if (meetingLocation) {
      properties.hs_meeting_location = meetingLocation
    }

    const meetingOutcome = context.dataFlowManager.resolveVariable(config.hs_meeting_outcome) || 'SCHEDULED'
    properties.hs_meeting_outcome = meetingOutcome

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

    // Create meeting
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/meetings', {
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
        fetch(`https://api.hubapi.com/crm/v4/objects/meetings/${data.id}/associations/contacts/${associatedContactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }])
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/meetings/${data.id}/associations/companies/${associatedCompanyId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 188 }])
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/meetings/${data.id}/associations/deals/${associatedDealId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 212 }])
        })
      )
    }
    if (associatedTicketId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/meetings/${data.id}/associations/tickets/${associatedTicketId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }])
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    return {
      success: true,
      output: {
        meetingId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties,
        associatedContactId,
        associatedCompanyId,
        associatedDealId,
        associatedTicketId
      },
      message: `Successfully logged meeting ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Meeting error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to log meeting in HubSpot'
    }
  }
}
