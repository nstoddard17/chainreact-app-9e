import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Duplicate an item in Monday.com
 */
export async function duplicateMondayItem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const itemId = await resolveValue(config.itemId, input)
    const withUpdates = config.withUpdates
      ? await resolveValue(config.withUpdates, input)
      : false

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!itemId) {
      throw new Error('Item ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    const mutation = `
      mutation($boardId: ID!, $itemId: ID!, $withUpdates: Boolean) {
        duplicate_item(board_id: $boardId, item_id: $itemId, with_updates: $withUpdates) {
          id
          name
          board {
            id
          }
          group {
            id
          }
          created_at
        }
      }
    `

    const variables = {
      boardId: boardId.toString(),
      itemId: itemId.toString(),
      withUpdates: withUpdates === 'true' || withUpdates === true
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

    const newItem = data.data?.duplicate_item

    if (!newItem) {
      throw new Error('Failed to duplicate item: No data returned')
    }

    logger.info('✅ Monday.com item duplicated successfully', { newItemId: newItem.id, originalItemId: itemId, userId })

    return {
      success: true,
      output: {
        newItemId: newItem.id,
        newItemName: newItem.name,
        originalItemId: itemId,
        boardId: newItem.board?.id || boardId,
        groupId: newItem.group?.id,
        createdAt: newItem.created_at
      },
      message: `Item ${itemId} duplicated successfully. New item ID: ${newItem.id}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com duplicate item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to duplicate Monday.com item'
    }
  }
}
