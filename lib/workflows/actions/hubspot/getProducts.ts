import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get Products from HubSpot
 *
 * API: POST /crm/v3/objects/products/search
 */
export async function hubspotGetProducts(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const filterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const filterValue = context.dataFlowManager.resolveVariable(config.filterValue)

    // Build request payload
    const payload: any = {
      limit: Math.min(limit, 100),
      properties: ['name', 'price', 'hs_sku', 'description']
    }

    // Add filtering if specified
    if (filterProperty && filterValue) {
      payload.filterGroups = [{
        filters: [{
          propertyName: filterProperty,
          operator: 'EQ',
          value: filterValue
        }]
      }]
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/products/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const products = (data.results || []).map((product: any) => ({
      id: product.id,
      name: product.properties.name,
      price: parseFloat(product.properties.price || '0'),
      hs_sku: product.properties.hs_sku,
      description: product.properties.description
    }))

    return {
      success: true,
      output: {
        products,
        count: products.length,
        total: data.total || products.length
      },
      message: `Successfully retrieved ${products.length} products from HubSpot`
    }
  } catch (error: any) {
    logger.error('HubSpot Get Products error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve products from HubSpot'
    }
  }
}
