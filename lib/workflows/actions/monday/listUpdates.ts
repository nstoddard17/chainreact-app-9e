import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List updates (comments) from a Monday.com item
 */
export async function listMondayUpdates(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const limit = config.limit
      ? await resolveValue(config.limit, input)
      : 25

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    const query = `
      query($itemId: [ID!], $limit: Int!) {
        items(ids: $itemId) {
          id
          name
          updates(limit: $limit) {
            id
            text_body
            creator {
              id
              name
            }
            created_at
            updated_at
          }
        }
      }
    `

    const variables = {
      itemId: [itemId.toString()],
      limit: parseInt(limit.toString()) || 25
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
    const updates = item.updates || []

    logger.info('✅ Monday.com updates listed successfully', { itemId, updateCount: updates.length, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        updates: updates,
        count: updates.length
      },
      message: `Retrieved ${updates.length} updates from item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list updates error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com updates'
    }
  }
}
