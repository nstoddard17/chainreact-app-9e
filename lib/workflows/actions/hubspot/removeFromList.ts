import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Remove Contact from HubSpot List
 *
 * API: DELETE /contacts/v1/lists/{listId}/remove
 */
export async function hubspotRemoveFromList(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const listId = context.dataFlowManager.resolveVariable(config.listId)
    const contactId = context.dataFlowManager.resolveVariable(config.contactId)

    if (!listId || !contactId) {
      throw new Error('List ID and contact ID are required')
    }

    logger.debug('Removing contact from list:', { listId, contactId })

    const response = await fetch(
      `https://api.hubapi.com/contacts/v1/lists/${listId}/remove`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vids: [contactId]
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    return {
      success: true,
      output: {
        success: true,
        listId,
        contactId,
        removedAt: new Date().toISOString()
      },
      message: `Successfully removed contact from list`
    }
  } catch (error: any) {
    logger.error('HubSpot Remove from List error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to remove contact from list'
    }
  }
}
