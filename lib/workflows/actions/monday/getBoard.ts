import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Get a specific board from Monday.com
 */
export async function getMondayBoard(
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

    // Build GraphQL query - Note: created_at is not available on Board type in API 2024-01
    const query = `
      query($boardId: [ID!]) {
        boards(ids: $boardId) {
          id
          name
          description
          board_kind
          state
          updated_at
          creator {
            id
            name
          }
          columns {
            id
            title
            type
          }
          groups {
            id
            title
            color
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

    logger.info('✅ Monday.com board retrieved successfully', { boardId, userId })

    return {
      success: true,
      output: {
        boardId: board.id,
        boardName: board.name,
        description: board.description,
        boardKind: board.board_kind,
        state: board.state,
        updatedAt: board.updated_at,
        creatorId: board.creator?.id,
        creatorName: board.creator?.name,
        columns: board.columns || [],
        groups: board.groups || [],
        columnCount: board.columns?.length || 0,
        groupCount: board.groups?.length || 0
      },
      message: `Board "${board.name}" retrieved successfully from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com get board error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get Monday.com board'
    }
  }
}
