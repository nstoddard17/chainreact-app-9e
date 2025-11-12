/**
 * HubSpot Line Items Handler
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface HubSpotLineItem {
  id: string
  name: string
  hs_object_id?: string
  hs_product_id?: string
  quantity?: number
}

export const getHubSpotLineItems: HubSpotDataHandler<HubSpotLineItem> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotLineItem[]> => {
  try {
    validateHubSpotIntegration(integration)

    const tokenResult = await validateHubSpotToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    const limit = Math.min(Math.max(options.limit || 100, 1), 100)
    const properties = ['name', 'hs_object_id', 'hs_product_id', 'quantity']
    const apiUrl = buildHubSpotApiUrl(`/crm/v3/objects/line_items?limit=${limit}&properties=${properties.join(',')}`)

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()
    const lineItems = (data.results || []).map((item: any) => ({
      id: item.id,
      name: item.properties?.name || `Line Item ${item.id}`,
      hs_object_id: item.properties?.hs_object_id,
      hs_product_id: item.properties?.hs_product_id,
      quantity: item.properties?.quantity ? Number(item.properties.quantity) : undefined
    }))

    logger.debug(`✅ HubSpot line items fetched successfully: ${lineItems.length} items`)
    return lineItems

  } catch (error: any) {
    logger.error("Error fetching HubSpot line items:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching HubSpot line items")
  }
}
