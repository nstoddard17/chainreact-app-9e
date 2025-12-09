import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List subitems from a Monday.com parent item
 */
export async function listMondaySubitems(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const parentItemId = await resolveValue(config.parentItemId, input)

    // Validate required fields
    if (!parentItemId) {
      throw new Error('Parent item ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    const query = `
      query($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          name
          subitems {
            id
            name
            state
            board {
              id
              name
            }
            column_values {
              id
              title
              type
              text
              value
            }
            created_at
            updated_at
          }
        }
      }
    `

    const variables = {
      itemId: [parentItemId.toString()]
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
      throw new Error('Parent item not found')
    }

    const parentItem = items[0]
    const subitems = parentItem.subitems || []

    logger.info('✅ Monday.com subitems listed successfully', { parentItemId, subitemCount: subitems.length, userId })

    return {
      success: true,
      output: {
        parentItemId: parentItem.id,
        parentItemName: parentItem.name,
        subitems: subitems,
        count: subitems.length
      },
      message: `Retrieved ${subitems.length} subitems from item ${parentItem.name}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list subitems error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com subitems'
    }
  }
}
