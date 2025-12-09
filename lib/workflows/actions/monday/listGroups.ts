import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List groups from a Monday.com board
 */
export async function listMondayGroups(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const boardId = await resolveValue(config.boardId, input)

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    const query = `
      query($boardId: [ID!]) {
        boards(ids: $boardId) {
          id
          name
          groups {
            id
            title
            color
            position
            archived
          }
        }
      }
    `

    const variables = {
      boardId: [boardId.toString()]
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

    const boards = data.data?.boards

    if (!boards || boards.length === 0) {
      throw new Error('Board not found')
    }

    const board = boards[0]
    const groups = board.groups || []

    logger.info('✅ Monday.com groups listed successfully', { boardId, groupCount: groups.length, userId })

    return {
      success: true,
      output: {
        boardId: board.id,
        boardName: board.name,
        groups: groups,
        count: groups.length
      },
      message: `Retrieved ${groups.length} groups from board ${board.name}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list groups error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com groups'
    }
  }
}
