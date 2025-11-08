import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Update a product in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/products/:id
 * Docs: https://stripe.com/docs/api/products/update
 */
export async function stripeUpdateProduct(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const productId = context.dataFlowManager.resolveVariable(config.productId)
    if (!productId) {
      throw new Error('Product ID is required')
    }

    const body: any = {}

    if (config.name) {
      body.name = context.dataFlowManager.resolveVariable(config.name)
    }
    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }
    if (config.active !== undefined) {
      const active = context.dataFlowManager.resolveVariable(config.active)
      body.active = active === true || active === 'true'
    }
    if (config.images) {
      const images = context.dataFlowManager.resolveVariable(config.images)
      if (Array.isArray(images)) {
        body.images = images
      } else if (typeof images === 'string') {
        try {
          body.images = JSON.parse(images)
        } catch (e) {
          body.images = [images]
        }
      }
    }
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Update Product] Failed to parse metadata', { metadata })
        }
      }
    }

    const response = await fetch(`https://api.stripe.com/v1/products/${productId}`, {
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
        created: product.created
      },
      message: `Successfully updated product ${product.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Update Product] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update product in Stripe'
    }
  }
}
