/**
 * Gumroad Products Handler
 */

import { GumroadIntegration, GumroadProduct, GumroadDataHandler } from '../types'
import { validateGumroadIntegration, validateGumroadToken, makeGumroadApiRequest, parseGumroadApiResponse, buildGumroadApiUrl } from '../utils'

export const getGumroadProducts: GumroadDataHandler<GumroadProduct> = async (integration: GumroadIntegration, options: any = {}): Promise<GumroadProduct[]> => {
  console.log("🔍 Gumroad products fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateGumroadIntegration(integration)
    
    console.log(`🔍 Validating Gumroad token...`)
    const tokenResult = await validateGumroadToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ Gumroad token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    console.log('🔍 Fetching Gumroad products...')
    
    const apiUrl = buildGumroadApiUrl('/products')
    const response = await makeGumroadApiRequest(apiUrl, tokenResult.token!)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`❌ Gumroad API error: ${response.status}`, errorData)
      
      if (response.status === 401) {
        throw new Error('Gumroad authentication expired. Please reconnect your account.')
      } else {
        throw new Error(`Gumroad API error: ${response.status} - ${errorData.message || "Unknown error"}`)
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
    
    console.log(`✅ Gumroad products fetched successfully: ${products.length} products`)
    return products
    
  } catch (error: any) {
    console.error("Error fetching Gumroad products:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Gumroad authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Gumroad API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Gumroad products")
  }
}