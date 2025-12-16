import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Search for items in Monday.com
 */
export async function searchMondayItems(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const searchValue = await resolveValue(config.searchValue, input)
    const columnId = config.columnId
      ? await resolveValue(config.columnId, input)
      : undefined
    const limit = config.limit
      ? await resolveValue(config.limit, input)
      : 25

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!searchValue) {
      throw new Error('Search value is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    let query = ''
    let variables: Record<string, any> = {
      boardId: boardId.toString(),
      limit: parseInt(limit.toString()) || 25
    }

    if (columnId) {
      // Search by column value
      query = `
        query($boardId: ID!, $columnId: String!, $columnValue: String!, $limit: Int!) {
          items_page_by_column_values(
            board_id: $boardId
            columns: [{column_id: $columnId, column_values: [$columnValue]}]
            limit: $limit
          ) {
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
      `
      variables.columnId = columnId.toString()
      variables.columnValue = searchValue.toString()
    } else {
      // Search by item name
      query = `
        query($boardId: ID!, $limit: Int!) {
          boards(ids: [$boardId]) {
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

    let items = []
    if (columnId) {
      items = data.data?.items_page_by_column_values?.items || []
    } else {
      items = data.data?.boards?.[0]?.items_page?.items || []
      // Filter by name if searching without column
      items = items.filter((item: any) =>
        item.name.toLowerCase().includes(searchValue.toString().toLowerCase())
      )
    }

    logger.info('✅ Monday.com items searched successfully', { boardId, resultCount: items.length, userId })

    return {
      success: true,
      output: {
        items: items,
        count: items.length,
        searchValue: searchValue,
        boardId: boardId
      },
      message: `Found ${items.length} items matching "${searchValue}" in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com search items error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to search Monday.com items'
    }
  }
}
