import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Move an item to a different group in Monday.com
 */
export async function moveMondayItem(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const itemId = await resolveValue(config.itemId, input)
    const targetGroupId = await resolveValue(config.targetGroupId, input)
    const sourceBoardId = await resolveValue(config.sourceBoardId, input)
    const targetBoardId = await resolveValue(config.targetBoardId, input)

    // Validate required fields
    if (!itemId) {
      throw new Error('Item ID is required')
    }
    if (!targetGroupId) {
      throw new Error('Target Group ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation
    const mutation = `
      mutation($itemId: ID!, $groupId: String!) {
        move_item_to_group(item_id: $itemId, group_id: $groupId) {
          id
          name
          group {
            id
            title
          }
        }
      }
    `

    const variables = {
      itemId: itemId.toString(),
      groupId: targetGroupId.toString()
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

    const item = data.data?.move_item_to_group

    if (!item) {
      throw new Error('Failed to move item: No data returned')
    }

    logger.info('✅ Monday.com item moved successfully', { itemId, targetGroupId, userId })

    return {
      success: true,
      output: {
        itemId: item.id,
        itemName: item.name,
        sourceBoardId: sourceBoardId,
        sourceGroupId: '', // Original group not available from move response
        targetBoardId: targetBoardId,
        targetGroupId: item.group?.id || targetGroupId,
        movedAt: new Date().toISOString()
      },
      message: `Item ${itemId} moved successfully to group ${targetGroupId}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com move item error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to move Monday.com item'
    }
  }
}
