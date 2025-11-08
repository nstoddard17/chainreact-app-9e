import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a product in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/products
 * Docs: https://stripe.com/docs/api/products/create
 */
export async function stripeCreateProduct(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Name is required
    const name = context.dataFlowManager.resolveVariable(config.name)
    if (!name) {
      throw new Error('Product name is required')
    }

    const body: any = { name }

    // Optional: Description
    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }

    // Optional: Active status
    if (config.active !== undefined) {
      const active = context.dataFlowManager.resolveVariable(config.active)
      body.active = active === true || active === 'true'
    }

    // Optional: Images (array of URLs)
    if (config.images) {
      const images = context.dataFlowManager.resolveVariable(config.images)
      if (Array.isArray(images)) {
        body.images = images
      } else if (typeof images === 'string') {
        try {
          body.images = JSON.parse(images)
        } catch (e) {
          // Single URL
          body.images = [images]
        }
      }
    }

    // Optional: Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Product] Failed to parse metadata', { metadata })
        }
      }
    }

    // Optional: Default price data (create product with price in one call)
    if (config.default_price_data) {
      const priceData = context.dataFlowManager.resolveVariable(config.default_price_data)
      if (typeof priceData === 'string') {
        try {
          body.default_price_data = JSON.parse(priceData)
        } catch (e) {
          logger.error('[Stripe Create Product] Failed to parse default_price_data', { priceData })
        }
      } else if (typeof priceData === 'object') {
        body.default_price_data = priceData
      }
    }

    // Make API call to create product
    const response = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const product = await response.json()

    return {
      success: true,
      output: {
        productId: product.id,
        name: product.name,
        description: product.description,
        active: product.active,
        images: product.images,
        metadata: product.metadata,
        defaultPrice: product.default_price,
        created: product.created
      },
      message: `Successfully created product ${product.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Product] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create product in Stripe'
    }
  }
}
