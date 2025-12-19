import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'
import { extractNumericId, toOrderGid } from './graphqlHelpers'

/**
 * Add Order Note (GraphQL)
 * Adds an internal note to an existing Shopify order
 */
export async function addShopifyOrderNote(
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
    const orderId = await resolveValue(config.order_id, input)
    const note = await resolveValue(config.note, input)
    const append = config.append ?? true

    // 3. Convert to GID format
    const orderGid = toOrderGid(orderId)
    const numericId = extractNumericId(orderGid)

    logger.debug('[Shopify GraphQL] Adding order note:', { orderId: orderGid, append })

    // 4. If appending, first get the existing note
    let finalNote = note
    if (append) {
      const orderQuery = `
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            note
          }
        }
      `

      const orderData = await makeShopifyGraphQLRequest(
        integration,
        orderQuery,
        { id: orderGid },
        selectedStore
      )

      const existingNote = orderData.order?.note
      if (existingNote) {
        finalNote = `${existingNote}\n\n${note}`
      }
    }

    // 5. Update the order with the new note using orderUpdate mutation
    const mutation = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const result = await makeShopifyGraphQLRequest(integration, mutation, {
      input: {
        id: orderGid,
        note: finalNote
      }
    }, selectedStore)

    const order = result.orderUpdate.order

    return {
      success: true,
      output: {
        success: true,
        order_id: numericId,
        order_gid: order.id,
        note: order.note
      },
      message: 'Order note added successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Add order note error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to add order note'
    }
  }
}
