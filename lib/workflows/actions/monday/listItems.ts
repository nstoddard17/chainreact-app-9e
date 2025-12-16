import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List items from a Monday.com board or group
 */
export async function listMondayItems(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const groupId = config.groupId
      ? await resolveValue(config.groupId, input)
      : undefined
    const limit = config.limit
      ? await resolveValue(config.limit, input)
      : 50

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    const query = `
      query($boardId: ID!, $limit: Int!) {
        boards(ids: [$boardId]) {
          id
          name
          items_page(limit: $limit) {
            items {
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
            }
          }
        }
      }
    `

    const variables = {
      boardId: boardId.toString(),
      limit: parseInt(limit.toString()) || 50
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

    const board = data.data?.boards?.[0]
    if (!board) {
      throw new Error('Board not found')
    }

    let items = board.items_page?.items || []

    // Filter by group if specified
    if (groupId) {
      items = items.filter((item: any) => item.group?.id === groupId.toString())
    }

    logger.info('✅ Monday.com items listed successfully', { boardId, groupId, itemCount: items.length, userId })

    return {
      success: true,
      output: {
        items: items,
        count: items.length,
        boardId: board.id,
        boardName: board.name,
        groupId: groupId
      },
      message: `Retrieved ${items.length} items from Monday.com ${groupId ? 'group' : 'board'}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list items error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com items'
    }
  }
}
