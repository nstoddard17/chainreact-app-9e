import { ActionResult } from '../index'
import { makeShopifyGraphQLRequest, validateShopifyIntegration } from '@/app/api/integrations/shopify/data/utils'
import { getIntegrationById } from '../../executeNode'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'
import { extractNumericId, toInventoryItemGid, toLocationGid } from './graphqlHelpers'

/**
 * Update Shopify Inventory (GraphQL)
 * Updates the inventory level of a product variant at a specific location
 */
export async function updateShopifyInventory(
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
    const inventoryItemId = await resolveValue(config.inventory_item_id, input)
    const locationId = await resolveValue(config.location_id, input)
    const adjustmentType = await resolveValue(config.adjustment_type, input)
    const quantity = Number(await resolveValue(config.quantity, input))

    // 3. Convert to GID format
    const inventoryItemGid = toInventoryItemGid(inventoryItemId)
    const locationGid = toLocationGid(locationId)

    logger.debug('[Shopify GraphQL] Updating inventory:', {
      inventoryItemId: inventoryItemGid,
      locationId: locationGid,
      adjustmentType,
      quantity
    })

    // 4. Calculate delta based on adjustment type
    let delta = quantity

    let startingQuantity: number | null = null
    if (adjustmentType === 'set') {
      const quantityQuery = `
        query currentQuantity($inventoryItemId: ID!, $locationId: ID!) {
          inventoryItem(id: $inventoryItemId) {
            inventoryLevel(locationId: $locationId) {
              quantities(names: "available") {
                name
                quantity
              }
            }
          }
        }
      `

      const quantityData = await makeShopifyGraphQLRequest(
        integration,
        quantityQuery,
        { inventoryItemId: inventoryItemGid, locationId: locationGid },
        selectedStore
      )

      startingQuantity =
        quantityData.inventoryItem?.inventoryLevel?.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0
      delta = quantity - startingQuantity
      if (quantity === startingQuantity) {
        return {
          success: true,
          output: {
            success: true,
            inventory_item_id: extractNumericId(inventoryItemGid),
            inventory_item_gid: inventoryItemGid,
            location_id: extractNumericId(locationGid),
            location_gid: locationGid,
            new_quantity: startingQuantity,
            delta: 0
          },
          message: 'Inventory already at requested quantity'
        }
      }
    } else if (adjustmentType === 'subtract') {
      delta = -quantity
    }
    // 'add' uses quantity as-is (delta = quantity)

    // 5. Make GraphQL request to adjust inventory
    const mutation = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            createdAt
            reason
            changes {
              name
              delta
              quantityAfterChange
            }
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
        reason: 'correction',
        name: 'available',
        changes: [
          {
            delta,
            inventoryItemId: inventoryItemGid,
            locationId: locationGid
          }
        ]
      }
    }, selectedStore)

    const change = result.inventoryAdjustQuantities.inventoryAdjustmentGroup.changes[0]
    let newQuantity =
      change?.quantityAfterChange?.quantity ??
      change?.quantityAfterChange ??
      null

    if (newQuantity === null) {
      const fallbackQuery = `
        query currentQuantity($inventoryItemId: ID!, $locationId: ID!) {
          inventoryItem(id: $inventoryItemId) {
            inventoryLevel(locationId: $locationId) {
              quantities(names: "available") {
                name
                quantity
              }
            }
          }
        }
      `
      const fallbackData = await makeShopifyGraphQLRequest(
        integration,
        fallbackQuery,
        { inventoryItemId: inventoryItemGid, locationId: locationGid },
        selectedStore
      )
      newQuantity =
        fallbackData.inventoryItem?.inventoryLevel?.quantities?.find((q: any) => q.name === 'available')?.quantity ?? null
    }

    if (newQuantity === null && startingQuantity !== null) {
      newQuantity = startingQuantity + delta
    }

    return {
      success: true,
      output: {
        success: true,
        inventory_item_id: extractNumericId(inventoryItemGid),
        inventory_item_gid: inventoryItemGid,
        location_id: extractNumericId(locationGid),
        location_gid: locationGid,
        new_quantity: newQuantity,
        delta: change.delta
      },
      message: 'Inventory updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify GraphQL] Update inventory error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update inventory'
    }
  }
}
