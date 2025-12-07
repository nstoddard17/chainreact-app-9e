import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Extract numeric ID from Shopify GID
 * Example: gid://shopify/Product/123456789 → 123456789
 */
function extractNumericId(gid: string): string {
  if (gid.includes('gid://shopify/')) {
    return gid.split('/').pop() || gid
  }
  return gid
}

/**
 * Create Shopify Product (GraphQL)
 * Creates a new product in Shopify with title, description, price, SKU, and inventory
 */
export async function createShopifyProduct(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)

    // 2. Resolve all config values (including shopify_store for multi-store support)
    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined
    const title = await resolveValue(config.title, input)
    const bodyHtml = config.body_html ? await resolveValue(config.body_html, input) : undefined
    const vendor = config.vendor ? await resolveValue(config.vendor, input) : undefined
    const productType = config.product_type ? await resolveValue(config.product_type, input) : undefined
    const price = await resolveValue(config.price, input)
    const sku = config.sku ? await resolveValue(config.sku, input) : undefined
    const inventoryQuantity = config.inventory_quantity !== undefined
      ? await resolveValue(config.inventory_quantity, input)
      : 0

    logger.debug('[Shopify GraphQL] Creating product:', { title, selectedStore })

    // 3. Build GraphQL mutation
    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            descriptionHtml
            vendor
            productType
            createdAt
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  sku
                  inventoryQuantity
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        title,
        descriptionHtml: bodyHtml,
        vendor,
        productType,
        variants: [
          {
            price: String(price),
            sku,
            inventoryQuantities: {
              availableQuantity: Number(inventoryQuantity),
              locationId: 'gid://shopify/Location/primary' // Will use default location
            }
          }
        ]
      }
    }

    // 4. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const product = result.productCreate.product
    const variant = product.variants.edges[0]?.node
    const shopDomain = getShopDomain(integration, selectedStore)
    const productId = extractNumericId(product.id)

    return {
      success: true,
      output: {
        product_id: productId,
        product_gid: product.id,
        variant_id: variant ? extractNumericId(variant.id) : undefined,
        variant_gid: variant?.id,
        title: product.title,
        admin_url: `https://${shopDomain}/admin/products/${productId}`,
        created_at: product.createdAt
      },
      message: 'Product created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Create product error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create product'
    }
  }
}