import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a task engagement in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tasks
 * - Docs: https://developers.hubspot.com/docs/api/crm/engagements/tasks
 * - Scopes: crm.objects.contacts.write
 */
export async function hubspotCreateTask(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    // Required field
    const taskSubject = context.dataFlowManager.resolveVariable(config.hs_task_subject)
    if (!taskSubject) {
      throw new Error('Task title is required')
    }
    properties.hs_task_subject = taskSubject

    // Optional fields
    const taskBody = context.dataFlowManager.resolveVariable(config.hs_task_body)
    if (taskBody) {
      properties.hs_task_body = taskBody
    }

    const taskStatus = context.dataFlowManager.resolveVariable(config.hs_task_status) || 'NOT_STARTED'
    properties.hs_task_status = taskStatus

    const taskPriority = context.dataFlowManager.resolveVariable(config.hs_task_priority) || 'MEDIUM'
    properties.hs_task_priority = taskPriority

    const taskType = context.dataFlowManager.resolveVariable(config.hs_task_type) || 'TODO'
    properties.hs_task_type = taskType

    const timestamp = context.dataFlowManager.resolveVariable(config.hs_timestamp)
    if (timestamp) {
      const timestampMs = new Date(timestamp).getTime()
      properties.hs_timestamp = timestampMs.toString()
    }

    const reminders = context.dataFlowManager.resolveVariable(config.hs_task_reminders)
    if (reminders) {
      properties.hs_task_reminders = reminders.toString()
    }

    const ownerId = context.dataFlowManager.resolveVariable(config.hubspot_owner_id)
    if (ownerId) {
      properties.hubspot_owner_id = ownerId
    }

    // Create task
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
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
        fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${data.id}/associations/contacts/${associatedContactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }])
        })
      )
    }
    if (associatedCompanyId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${data.id}/associations/companies/${associatedCompanyId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 192 }])
        })
      )
    }
    if (associatedDealId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${data.id}/associations/deals/${associatedDealId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }])
        })
      )
    }
    if (associatedTicketId) {
      associations.push(
        fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${data.id}/associations/tickets/${associatedTicketId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 220 }])
        })
      )
    }

    if (associations.length > 0) {
      await Promise.all(associations)
    }

    return {
      success: true,
      output: {
        taskId: data.id,
        ...data.properties,
        createdate: data.createdAt,
        properties: data.properties,
        associatedContactId,
        associatedCompanyId,
        associatedDealId,
        associatedTicketId
      },
      message: `Successfully created task ${data.id} in HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Task error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create task in HubSpot'
    }
  }
}
