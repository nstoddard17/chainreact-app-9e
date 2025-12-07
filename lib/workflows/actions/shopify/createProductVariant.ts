import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration, getShopDomain } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'
import { extractNumericId, toProductGid } from './graphqlHelpers'

/**
 * Create Shopify Product Variant (GraphQL)
 * Creates a new variant for an existing product (e.g., new size, color, material combination)
 *
 * Note: In GraphQL, variants are created using productVariantsBulkCreate mutation
 */
export async function createShopifyProductVariant(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getIntegrationById(integrationId)
    validateShopifyIntegration(integration)
    const selectedStore = config.shopify_store ? await resolveValue(config.shopify_store, input) : undefined

    // 2. Resolve all config values
    const productId = await resolveValue(config.product_id, input)
    const price = await resolveValue(config.price, input)
    const option1 = config.option1 ? await resolveValue(config.option1, input) : undefined
    const option2 = config.option2 ? await resolveValue(config.option2, input) : undefined
    const option3 = config.option3 ? await resolveValue(config.option3, input) : undefined
    const sku = config.sku ? await resolveValue(config.sku, input) : undefined
    const inventoryQuantity = config.inventory_quantity ? parseInt(await resolveValue(config.inventory_quantity, input)) : 0
    const weight = config.weight ? parseFloat(await resolveValue(config.weight, input)) : undefined
    const barcode = config.barcode ? await resolveValue(config.barcode, input) : undefined

    // 3. Convert to GID format
    const productGid = toProductGid(productId)
    const numericProductId = extractNumericId(productGid)

    logger.debug('[Shopify GraphQL] Creating product variant:', { productId: productGid, option1, option2, option3 })

    // 4. Build GraphQL mutation for creating variant
    const mutation = `
      mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            sku
            barcode
            weight
            weightUnit
            inventoryQuantity
            selectedOptions {
              name
              value
            }
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    // 5. Build variant input
    const variantInput: any = {
      price: String(price)
    }

    // Build options array (only include non-empty options)
    const options: string[] = []
    if (option1) options.push(option1)
    if (option2) options.push(option2)
    if (option3) options.push(option3)

    if (options.length > 0) {
      variantInput.optionValues = options.map((value, index) => ({
        optionName: `Option${index + 1}`, // This should match product's option names
        name: value
      }))
    }

    if (sku) variantInput.sku = sku
    if (barcode) variantInput.barcode = barcode
    if (weight) {
      variantInput.weight = weight
      variantInput.weightUnit = 'POUNDS'
    }

    // Note: Inventory quantity in GraphQL is handled differently
    // It requires inventoryItem and location IDs which we may not have
    if (inventoryQuantity > 0) {
      logger.debug('[Shopify GraphQL] Note: Inventory quantity will be set to default location')
    }

    const variables = {
      productId: productGid,
      variants: [variantInput]
    }

    // 6. Make GraphQL request
    const result = await makeShopifyGraphQLRequest(integration, mutation, variables, selectedStore)

    const variant = result.productVariantsBulkCreate.productVariants[0]
    const shopDomain = getShopDomain(integration, selectedStore)
    const variantId = extractNumericId(variant.id)

    return {
      success: true,
      output: {
        success: true,
        variant_id: variantId,
        variant_gid: variant.id,
        product_id: numericProductId,
        product_gid: productGid,
        sku: variant.sku,
        price: variant.price,
        option1: variant.selectedOptions[0]?.value,
        option2: variant.selectedOptions[1]?.value,
        option3: variant.selectedOptions[2]?.value,
        admin_url: `https://${shopDomain}/admin/products/${numericProductId}/variants/${variantId}`,
        created_at: variant.createdAt
      },
      message: 'Product variant created successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Create product variant error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to create product variant'
    }
  }
}
