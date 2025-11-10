/**
 * Shopify Integration Utilities
 */

import { ShopifyIntegration, ShopifyApiError } from './types'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

/**
 * Get Shopify shop domain from integration metadata
 * @param integration - The integration object
 * @param selectedShop - Optional: specific shop domain to use (for multi-store support)
 */
export function getShopDomain(integration: ShopifyIntegration, selectedShop?: string): string {
  const metadata = integration.metadata as any

  // If a specific shop is requested, use that
  if (selectedShop) {
    // Verify it's in the stores list
    const stores = metadata?.stores || []
    const storeExists = stores.some((s: any) => s.shop === selectedShop)
    if (storeExists) {
      return selectedShop
    }
    logger.debug(`Requested shop ${selectedShop} not found in stores list, falling back to default`)
  }

  // Try active_store from metadata
  if (metadata?.active_store) {
    return metadata.active_store
  }

  // Try stores array (use first store)
  if (metadata?.stores && metadata.stores.length > 0) {
    return metadata.stores[0].shop
  }

  // Legacy: Try single shop field
  if (metadata?.shop) {
    return metadata.shop
  }

  // Legacy: Try top-level shop_domain
  if (integration.shop_domain) {
    return integration.shop_domain
  }

  throw new Error('Shop domain not found in integration. Please reconnect your Shopify account.')
}

/**
 * Create Shopify API request headers
 */
export async function getShopifyHeaders(integration: ShopifyIntegration): Promise<Record<string, string>> {
  if (!integration.access_token) {
    throw new Error('No access token available')
  }

  const decryptedToken = await decrypt(integration.access_token)

  return {
    'X-Shopify-Access-Token': decryptedToken,
    'Content-Type': 'application/json',
  }
}

/**
 * Make authenticated request to Shopify Admin API
 */
export async function makeShopifyRequest(
  integration: ShopifyIntegration,
  endpoint: string,
  options: RequestInit = {},
  selectedStore?: string
): Promise<any> {
  const shopDomain = getShopDomain(integration, selectedStore)
  const headers = await getShopifyHeaders(integration)

  const url = `https://${shopDomain}/admin/api/2024-01/${endpoint}`

  logger.debug('[Shopify] Making request:', { url, method: options.method || 'GET' })

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('[Shopify] API error:', {
      status: response.status,
      error: errorText
    })
    throw createShopifyApiError(
      `Shopify API error: ${response.status} - ${errorText}`,
      response.status
    )
  }

  return response.json()
}

/**
 * Create Shopify API error with proper context
 */
export function createShopifyApiError(message: string, status?: number): ShopifyApiError {
  const error = new Error(message) as ShopifyApiError
  error.status = status
  error.name = 'ShopifyApiError'

  if (status === 401) {
    error.message = 'Shopify authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Shopify API access forbidden. Check your app permissions.'
  } else if (status === 429) {
    error.message = 'Shopify API rate limit exceeded. Please try again later.'
  } else if (status === 404) {
    error.message = 'Shopify resource not found.'
  }

  return error
}

/**
 * Validate Shopify integration has required access token
 */
export function validateShopifyIntegration(integration: ShopifyIntegration): void {
  if (!integration) {
    throw new Error('Shopify integration not found')
  }

  if (!integration.access_token) {
    throw new Error('Shopify authentication required. Please reconnect your account.')
  }

  if (integration.provider !== 'shopify') {
    throw new Error('Invalid integration provider. Expected Shopify.')
  }

  // Check for shop domain in either top-level field or metadata
  const metadata = integration.metadata as any
  if (!integration.shop_domain && !metadata?.shop) {
    throw new Error('Shop domain not found. Please reconnect your Shopify account.')
  }
}
