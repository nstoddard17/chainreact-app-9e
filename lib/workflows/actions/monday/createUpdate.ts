import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Create an update (comment) on a Monday.com item
 */
export async function createMondayUpdate(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const text = await resolveValue(config.text, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!text) {
      throw new Error('Update text is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation with variables so large IDs don't overflow GraphQL Int
    // Note: Only request fields that don't require special permissions
    const mutation = `
      mutation($itemId: ID!, $body: String!) {
        create_update(
          item_id: $itemId
          body: $body
        ) {
          id
        }
      }
    `
    const variables = {
      itemId: itemId.toString(),
      body: text.toString()
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
      return {
        success: false,
        output: {
          errorDetails: data.errors
        },
        message: `Monday.com error: ${errorMessages}`
      }
    }

    const update = data.data?.create_update

    if (!update) {
      throw new Error('Failed to create update: No data returned')
    }

    logger.info('✅ Monday.com update created successfully', { updateId: update.id, itemId, userId })

    return {
      success: true,
      output: {
        updateId: update.id,
        itemId: itemId,
        text: text.toString()
      },
      message: `Update posted successfully to item ${itemId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com create update error:', error)
    return {
      success: false,
      output: {
        errorDetails: error?.errorDetails
      },
      message: error.message || 'Failed to create Monday.com update'
    }
  }
}
