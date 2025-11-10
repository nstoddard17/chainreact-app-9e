/**
 * Gumroad Products Handler
 */

import { GumroadIntegration, GumroadProduct, GumroadDataHandler } from '../types'
import { validateGumroadIntegration, validateGumroadToken, makeGumroadApiRequest, parseGumroadApiResponse, buildGumroadApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getGumroadProducts: GumroadDataHandler<GumroadProduct> = async (integration: GumroadIntegration, options: any = {}): Promise<GumroadProduct[]> => {
  logger.debug("🔍 Gumroad products fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateGumroadIntegration(integration)
    
    logger.debug(`🔍 Validating Gumroad token...`)
    const tokenResult = await validateGumroadToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ Gumroad token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Fetching Gumroad products...')

    // Gumroad API uses access_token as query parameter (handled by makeGumroadApiRequest)
    const apiUrl = buildGumroadApiUrl('/products')
    const response = await makeGumroadApiRequest(apiUrl, tokenResult.token!)
    
    if (!response.ok) {
      let errorData: any = {}
      let errorText = ''

      try {
        errorText = await response.text()
        errorData = JSON.parse(errorText)
      } catch (e) {
        errorData = { rawError: errorText }
      }

      logger.error(`❌ Gumroad API error: ${response.status}`, {
        status: response.status,
        statusText: response.statusText,
        errorData,
        url: response.url
      })

      if (response.status === 401) {
        throw new Error('Gumroad authentication expired. Please reconnect your account.')
      } else {
        throw new Error(`Gumroad API error: ${response.status} - ${errorData.message || errorText || "Unknown error"}`)
      }
    }
    
    const data = await response.json()
    
    // Transform products to expected format
    const products = (data.products || []).map((product: any) => ({
      value: product.id,
      label: product.name,
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      url: product.url,
      currency: product.currency,
      published: product.published,
      max_purchase_count: product.max_purchase_count,
      sales_count: product.sales_count,
      tags: product.tags
    }))
    
    logger.debug(`✅ Gumroad products fetched successfully: ${products.length} products`)
    return products
    
  } catch (error: any) {
    logger.error("Error fetching Gumroad products:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Gumroad authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Gumroad API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Gumroad products")
  }
}