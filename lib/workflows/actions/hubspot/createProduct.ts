import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create Product in HubSpot
 *
 * API: POST /crm/v3/objects/products
 */
export async function hubspotCreateProduct(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Build properties object
    const properties: any = {}

    const fieldsToSet = [
      'name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold', 'hs_recurring_billing_period'
    ]

    fieldsToSet.forEach(field => {
      const value = context.dataFlowManager.resolveVariable(config[field])
      if (value !== undefined && value !== null && value !== '') {
        properties[field] = value
      }
    })

    if (!properties.name) {
      throw new Error('Product name is required')
    }

    logger.debug('Creating HubSpot product:', properties)

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/products', {
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

    return {
      success: true,
      output: {
        id: data.id,
        name: data.properties.name,
        price: parseFloat(data.properties.price || '0'),
        hs_sku: data.properties.hs_sku,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      },
      message: `Successfully created product: ${data.properties.name}`
    }
  } catch (error: any) {
    logger.error('HubSpot Create Product error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create product'
    }
  }
}
