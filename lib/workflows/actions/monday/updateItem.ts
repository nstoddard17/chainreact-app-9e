import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Update an existing item in Monday.com
 */
export async function updateMondayItem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)
    const itemId = await resolveValue(config.itemId, input)
    const columnId = await resolveValue(config.columnId, input)
    const columnValue = await resolveValue(config.columnValue, input)
    const additionalColumns = config.additionalColumns
      ? await resolveValue(config.additionalColumns, input)
      : undefined

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnId) {
      throw new Error('Column ID is required')
    }
    if (columnValue === undefined || columnValue === null || columnValue === '') {
      throw new Error('Column value is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build column values object
    let parsedColumnValues: Record<string, any> = {
      [columnId]: columnValue
    }

    // Merge additional columns if provided
    if (additionalColumns) {
      let additionalParsed = additionalColumns
      if (typeof additionalColumns === 'string') {
        try {
          additionalParsed = JSON.parse(additionalColumns)
        } catch (e) {
          throw new Error('Additional columns must be valid JSON')
        }
      }
      parsedColumnValues = { ...parsedColumnValues, ...additionalParsed }
    }

    // Build GraphQL mutation
    const mutation = `
      mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId
          item_id: $itemId
          column_values: $columnValues
        ) {
          id
          name
        }
      }
    `

    const variables = {
      boardId: boardId.toString(),
      itemId: itemId.toString(),
      columnValues: JSON.stringify(parsedColumnValues)
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

    const item = data.data?.change_multiple_column_values

    if (!item) {
      throw new Error('Failed to update item: No data returned')
    }

    logger.info('✅ Monday.com item updated successfully', { itemId, boardId, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        updatedColumns: Object.keys(parsedColumnValues),
        success: true,
        updatedAt: new Date().toISOString()
      },
      message: `Item ${itemId} updated successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com update item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update Monday.com item'
    }
  }
}
