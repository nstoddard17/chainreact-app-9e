import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Update Line Item in HubSpot
 *
 * API: PATCH /crm/v3/objects/line_items/{lineItemId}
 */
export async function hubspotUpdateLineItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const lineItemId = context.dataFlowManager.resolveVariable(config.lineItemId)
    const quantity = context.dataFlowManager.resolveVariable(config.quantity)
    const price = context.dataFlowManager.resolveVariable(config.price)
    const discount = context.dataFlowManager.resolveVariable(config.discount)

    if (!lineItemId) {
      throw new Error('Line Item ID is required')
    }

    // Build properties object with only provided fields
    const properties: any = {}

    if (quantity !== undefined && quantity !== null) {
      properties.quantity = quantity.toString()
    }

    if (price !== undefined && price !== null) {
      properties.price = price.toString()
    }

    if (discount !== undefined && discount !== null) {
      properties.discount = discount.toString()
    }

    if (Object.keys(properties).length === 0) {
      throw new Error('At least one field (quantity, price, or discount) must be provided')
    }

    logger.debug('Updating line item:', { lineItemId, properties })

    const response = await fetch(
      `https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const lineItem = await response.json()

    return {
      success: true,
      output: {
        lineItemId: lineItem.id,
        productId: lineItem.properties.hs_product_id,
        quantity: lineItem.properties.quantity,
        price: lineItem.properties.price,
        discount: lineItem.properties.discount,
        amount: lineItem.properties.amount,
        updatedAt: lineItem.updatedAt,
        properties: lineItem.properties
      },
      message: `Successfully updated line item`
    }
  } catch (error: any) {
    logger.error('HubSpot Update Line Item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update line item'
    }
  }
}
