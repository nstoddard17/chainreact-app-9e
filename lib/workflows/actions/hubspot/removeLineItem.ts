import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Remove Line Item from HubSpot
 *
 * API: DELETE /crm/v3/objects/line_items/{lineItemId}
 */
export async function hubspotRemoveLineItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const lineItemId = context.dataFlowManager.resolveVariable(config.lineItemId)

    if (!lineItemId) {
      throw new Error('Line Item ID is required')
    }

    logger.debug('Removing line item:', { lineItemId })

    const response = await fetch(
      `https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
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
        lineItemId,
        deletedAt: new Date().toISOString()
      },
      message: `Successfully removed line item`
    }
  } catch (error: any) {
    logger.error('HubSpot Remove Line Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to remove line item'
    }
  }
}
