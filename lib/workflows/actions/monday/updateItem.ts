import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

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
    const columnValues = await resolveValue(config.columnValues, input)

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!columnValues) {
      throw new Error('Column values are required')
    }

    // Get Monday.com integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'monday')
      .eq('status', 'connected')
      .single()

    if (integrationError || !integration) {
      throw new Error('Monday.com integration not found. Please connect your Monday.com account.')
    }

    // Get access token
    const accessToken = getDecryptedAccessToken(integration)

    // Parse column values
    let parsedColumnValues = columnValues
    if (typeof columnValues === 'string') {
      try {
        parsedColumnValues = JSON.parse(columnValues)
      } catch (e) {
        throw new Error('Column values must be valid JSON')
      }
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
