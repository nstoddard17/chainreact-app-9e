import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Get a specific item from Monday.com
 */
export async function getMondayItem(
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

    // Build GraphQL query - Note: column_values doesn't have 'title' in API 2024-01
    const query = `
      query($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          name
          state
          board {
            id
            name
          }
          group {
            id
            title
          }
          column_values {
            id
            type
            text
            value
            column {
              id
              title
            }
          }
          created_at
          updated_at
          creator {
            id
            name
          }
        }
      }
    `

    const variables = {
      itemId: [itemId.toString()]
    }

    // Make API request
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query, variables })
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

    const items = data.data?.items

    if (!items || items.length === 0) {
      throw new Error('Item not found')
    }

    const item = items[0]

    logger.info('✅ Monday.com item retrieved successfully', { itemId, userId })

    // Map column values to include title from nested column object
    const columnValues = (item.column_values || []).map((cv: any) => ({
      id: cv.id,
      title: cv.column?.title || cv.id,
      type: cv.type,
      text: cv.text,
      value: cv.value
    }))

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        state: item.state,
        boardId: item.board?.id,
        boardName: item.board?.name,
        groupId: item.group?.id,
        groupTitle: item.group?.title,
        columnValues: columnValues,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        creatorId: item.creator?.id,
        creatorName: item.creator?.name
      },
      message: `Item ${itemId} retrieved successfully from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com get item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get Monday.com item'
    }
  }
}
