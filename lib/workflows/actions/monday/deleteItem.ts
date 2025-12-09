import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Delete an item from Monday.com
 */
export async function deleteMondayItem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    const mutation = `
      mutation($itemId: ID!) {
        delete_item(item_id: $itemId) {
          id
        }
      }
    `

    const variables = {
      itemId: itemId.toString()
    }

    // Make API request
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query: mutation, variables })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Monday.com API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: any) => e.message).join(', ')
      throw new Error(`Monday.com error: ${errorMessages}`)
    }

    const deletedItem = data.data?.delete_item

    if (!deletedItem) {
      throw new Error('Failed to delete item: No data returned')
    }

    logger.info('✅ Monday.com item deleted successfully', { itemId, userId })

    return {
      success: true,
      output: {
        deletedItemId: deletedItem.id,
        deletedAt: new Date().toISOString()
      },
      message: `Item ${itemId} deleted successfully from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com delete item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to delete Monday.com item'
    }
  }
}
