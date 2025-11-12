/**
 * HubSpot Products Handler
 *
 * API Verification:
 * - Endpoint: GET /crm/v3/objects/products
 * - Docs: https://developers.hubspot.com/docs/api-reference/crm-products-v3
 * - Scopes: e-commerce
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface HubSpotProduct {
  id: string
  name: string
  price: number
  hs_sku: string
  description: string
  warning?: boolean
}

export const getHubSpotProducts: HubSpotDataHandler<HubSpotProduct> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotProduct[]> => {
  try {
    validateHubSpotIntegration(integration)

    const tokenResult = await validateHubSpotToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    const apiUrl = buildHubSpotApiUrl('/crm/v3/objects/products?limit=100&properties=name,price,hs_sku,description')
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (response.status === 403) {
      logger.warn('HubSpot products endpoint forbidden (missing products permission). Returning fallback option.')
      return [{
        id: '__hubspot_products_scope_missing__',
        name: 'Reconnect HubSpot with CRM Products access to load products',
        price: 0,
        hs_sku: '',
        description: 'HubSpot denied access to products. Reconnect your HubSpot account with the “Products” (CRM objects) permission to fetch real items.',
        warning: true
      }]
    }

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()
    const products = (data.results || []).map((product: any) => ({
      id: product.id,
      name: product.properties?.name || '',
      price: parseFloat(product.properties?.price || '0'),
      hs_sku: product.properties?.hs_sku || '',
      description: product.properties?.description || ''
    }))

    logger.debug(`✅ Fetched ${products.length} products`)
    return products

  } catch (error: any) {
    logger.error("Error fetching HubSpot products:", error)
    throw new Error(error.message || "Error fetching HubSpot products")
  }
}
