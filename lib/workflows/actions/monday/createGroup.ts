import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new group in a Monday.com board
 */
export async function createMondayGroup(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values - support both groupTitle (schema) and groupName (legacy)
    const boardId = await resolveValue(config.boardId, input)
    const groupTitle = await resolveValue(config.groupTitle || config.groupName, input)
    const color = await resolveValue(config.color, input)

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }
    if (!groupTitle) {
      throw new Error('Group title is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation with optional color
    let mutation: string
    let variables: Record<string, any>

    if (color) {
      mutation = `
        mutation($boardId: ID!, $groupName: String!, $groupColor: String) {
          create_group(board_id: $boardId, group_name: $groupName, group_color: $groupColor) {
            id
            title
            color
          }
        }
      `
      variables = {
        boardId: boardId.toString(),
        groupName: groupTitle.toString(),
        groupColor: color.toString()
      }
    } else {
      mutation = `
        mutation($boardId: ID!, $groupName: String!) {
          create_group(board_id: $boardId, group_name: $groupName) {
            id
            title
            color
          }
        }
      `
      variables = {
        boardId: boardId.toString(),
        groupName: groupTitle.toString()
      }
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

    const group = data.data?.create_group

    if (!group) {
      throw new Error('Failed to create group: No data returned')
    }

    logger.info('✅ Monday.com group created successfully', { groupId: group.id, boardId, userId })

    return {
      success: true,
      output: {
        groupId: group.id,
        groupTitle: group.title,
        groupColor: group.color,
        boardId: boardId,
        createdAt: new Date().toISOString()
      },
      message: `Group "${groupTitle}" created successfully in Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com create group error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Monday.com group'
    }
  }
}
