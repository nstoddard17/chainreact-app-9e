import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get Line Items for a Deal in HubSpot
 *
 * API: GET /crm/v3/objects/deals/{dealId}/associations/line_items
 */
export async function hubspotGetLineItems(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const dealId = context.dataFlowManager.resolveVariable(config.dealId)

    if (!dealId) {
      throw new Error('Deal ID is required')
    }

    logger.debug('Getting line items for deal:', { dealId })

    // Get associated line item IDs
    const associationsResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/line_items`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!associationsResponse.ok) {
      const errorText = await associationsResponse.text()
      throw new Error(`HubSpot API error: ${associationsResponse.status} - ${errorText}`)
    }

    const associations = await associationsResponse.json()
    const lineItemIds = (associations.results || []).map((result: any) => result.id)

    if (lineItemIds.length === 0) {
      return {
        success: true,
        output: {
          lineItems: [],
          count: 0,
          dealId
        },
        message: `No line items found for deal`
      }
    }

    // Fetch full line item details
    const lineItemsPromises = lineItemIds.map((id: string) =>
      fetch(`https://api.hubapi.com/crm/v3/objects/line_items/${id}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(res => res.json())
    )

    const lineItems = await Promise.all(lineItemsPromises)

    const mappedLineItems = lineItems.map((item: any) => ({
      id: item.id,
      productId: item.properties.hs_product_id,
      quantity: item.properties.quantity,
      price: item.properties.price,
      discount: item.properties.discount,
      amount: item.properties.amount,
      name: item.properties.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))

    return {
      success: true,
      output: {
        lineItems: mappedLineItems,
        count: mappedLineItems.length,
        dealId
      },
      message: `Successfully retrieved ${mappedLineItems.length} line items`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Line Items error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve line items'
    }
  }
}
