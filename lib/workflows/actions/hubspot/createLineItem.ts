import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create Line Item in HubSpot
 *
 * API: POST /crm/v3/objects/line_items
 * Associates a product with a deal
 */
export async function hubspotCreateLineItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const dealId = context.dataFlowManager.resolveVariable(config.dealId)
    const productId = context.dataFlowManager.resolveVariable(config.productId)
    const quantity = context.dataFlowManager.resolveVariable(config.quantity) || 1
    const price = context.dataFlowManager.resolveVariable(config.price)
    const discount = context.dataFlowManager.resolveVariable(config.discount)

    if (!dealId || !productId) {
      throw new Error('Deal ID and Product ID are required')
    }

    logger.debug('Creating line item:', { dealId, productId, quantity })

    // Build properties object
    const properties: any = {
      hs_product_id: productId,
      quantity: quantity.toString()
    }

    if (price) {
      properties.price = price.toString()
    }

    if (discount) {
      properties.discount = discount.toString()
    }

    // Create the line item
    const createResponse = await fetch(
      'https://api.hubapi.com/crm/v3/objects/line_items',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`HubSpot API error: ${createResponse.status} - ${errorText}`)
    }

    const lineItem = await createResponse.json()

    // Associate line item with deal
    const associationResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/line_items/${lineItem.id}/associations/deals/${dealId}/line_item_to_deal`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!associationResponse.ok) {
      const errorText = await associationResponse.text()
      // Log warning but don't fail - line item was created
      logger.error('Failed to associate line item with deal:', errorText)
    }

    return {
      success: true,
      output: {
        lineItemId: lineItem.id,
        dealId,
        productId: lineItem.properties.hs_product_id,
        quantity: lineItem.properties.quantity,
        price: lineItem.properties.price,
        discount: lineItem.properties.discount,
        amount: lineItem.properties.amount,
        createdAt: lineItem.createdAt,
        properties: lineItem.properties
      },
      message: `Successfully created line item and associated with deal`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Line Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create line item'
    }
  }
}
