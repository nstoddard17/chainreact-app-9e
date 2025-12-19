import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new item in Monday.com
 */
export async function createMondayItem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const groupId = await resolveValue(config.groupId, input)
    const itemName = await resolveValue(config.itemName, input)
    const columnValues = config.columnValues
      ? await resolveValue(config.columnValues, input)
      : undefined

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!groupId) {
      throw new Error('Group ID is required')
    }
    if (!itemName) {
      throw new Error('Item name is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    let mutation = `
      mutation($boardId: ID!, $groupId: String!, $itemName: String!) {
        create_item(
          board_id: $boardId
          group_id: $groupId
          item_name: $itemName
        ) {
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

    const variables: Record<string, any> = {
      boardId: boardId.toString(),
      groupId: groupId.toString(),
      itemName: itemName.toString()
    }

    // Add column values if provided
    if (columnValues) {
      let parsedColumnValues = columnValues
      if (typeof columnValues === 'string') {
        try {
          parsedColumnValues = JSON.parse(columnValues)
        } catch (e) {
          logger.warn('Failed to parse column values as JSON, using as-is')
        }
      }

      mutation = `
        mutation($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
          create_item(
            board_id: $boardId
            group_id: $groupId
            item_name: $itemName
            column_values: $columnValues
          ) {
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
      variables.columnValues = JSON.stringify(parsedColumnValues)
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

    const item = data.data?.create_item

    if (!item) {
      throw new Error('Failed to create item: No data returned')
    }

    logger.info('✅ Monday.com item created successfully', { itemId: item.id, boardId, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        boardId: item.board?.id || boardId,
        groupId: item.group?.id || groupId,
        createdAt: item.created_at
      },
      message: `Item "${itemName}" created successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com create item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Monday.com item'
    }
  }
}
