import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Update Product in HubSpot
 *
 * API: PATCH /crm/v3/objects/products/{productId}
 */
export async function hubspotUpdateProduct(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const productId = context.dataFlowManager.resolveVariable(config.productId)
    if (!productId) {
      throw new Error('Product ID is required')
    }

    // Build properties object with only non-empty fields
    const properties: any = {}

    const fieldsToUpdate = [
      'name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold'
    ]

    fieldsToUpdate.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    if (Object.keys(properties).length === 0) {
      throw new Error('At least one field must be provided to update')
    }

    logger.debug('Updating HubSpot product:', { productId, properties })

    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/products/${productId}`, {
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
        id: data.id,
        name: data.properties.name,
        price: parseFloat(data.properties.price || '0'),
        hs_sku: data.properties.hs_sku,
        updatedAt: data.updatedAt
      },
      message: `Successfully updated product: ${data.properties.name}`
    }
  } catch (error: any) {
    logger.error('HubSpot Update Product error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update product'
    }
  }
}
