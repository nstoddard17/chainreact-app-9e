import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Archive an item in Monday.com
 */
export async function archiveMondayItem(
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
        archive_item(item_id: $itemId) {
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

    const archivedItem = data.data?.archive_item

    if (!archivedItem) {
      throw new Error('Failed to archive item: No data returned')
    }

    logger.info('✅ Monday.com item archived successfully', { itemId, userId })

    return {
      success: true,
      output: {
        archivedItemId: archivedItem.id,
        archivedAt: new Date().toISOString()
      },
      message: `Item ${itemId} archived successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com archive item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to archive Monday.com item'
    }
  }
}
