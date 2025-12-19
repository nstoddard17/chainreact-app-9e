import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Create a subitem under a parent item in Monday.com
 */
export async function createMondaySubitem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const parentItemId = await resolveValue(config.parentItemId, input)
    const itemName = await resolveValue(config.itemName, input)
    const columnValues = config.columnValues
      ? await resolveValue(config.columnValues, input)
      : undefined

    // Validate required fields
    if (!parentItemId) {
      throw new Error('Parent item ID is required')
    }
    if (!itemName) {
      throw new Error('Subitem name is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    let mutation = `
      mutation($parentItemId: ID!, $itemName: String!) {
        create_subitem(
          parent_item_id: $parentItemId
          item_name: $itemName
        ) {
          id
          name
          board {
            id
          }
          created_at
        }
      }
    `

    const variables: Record<string, any> = {
      parentItemId: parentItemId.toString(),
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
        mutation($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_subitem(
            parent_item_id: $parentItemId
            item_name: $itemName
            column_values: $columnValues
          ) {
            id
            name
            board {
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

    const subitem = data.data?.create_subitem

    if (!subitem) {
      throw new Error('Failed to create subitem: No data returned')
    }

    logger.info('✅ Monday.com subitem created successfully', { subitemId: subitem.id, parentItemId, userId })

    return {
      success: true,
      output: {
        subitemId: subitem.id,
        subitemName: subitem.name,
        parentItemId: parentItemId,
        boardId: subitem.board?.id,
        createdAt: subitem.created_at
      },
      message: `Subitem "${itemName}" created successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com create subitem error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Monday.com subitem'
    }
  }
}