import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Duplicate a board in Monday.com
 */
export async function duplicateMondayBoard(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values - support both newBoardName (schema) and boardName (legacy)
    const boardId = await resolveValue(config.boardId, input)
    const duplicateType = await resolveValue(config.duplicateType, input) || 'duplicate_board_with_structure'
    const boardName = config.newBoardName
      ? await resolveValue(config.newBoardName, input)
      : config.boardName
        ? await resolveValue(config.boardName, input)
        : undefined

    // Validate required fields
    if (!boardId) {
      throw new Error('Board ID is required')
    }

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL mutation - duplicate_board returns BoardDuplication with a board field
    let mutation = `
      mutation($boardId: ID!, $duplicateType: DuplicateBoardType!) {
        duplicate_board(board_id: $boardId, duplicate_type: $duplicateType) {
          board {
            id
            name
            description
            board_kind
          }
        }
      }
    `

    const variables: Record<string, any> = {
      boardId: boardId.toString(),
      duplicateType: duplicateType
    }

    // Add board name if provided
    if (boardName) {
      mutation = `
        mutation($boardId: ID!, $duplicateType: DuplicateBoardType!, $boardName: String!) {
          duplicate_board(board_id: $boardId, duplicate_type: $duplicateType, board_name: $boardName) {
            board {
              id
              name
              description
              board_kind
            }
          }
        }
      `
      variables.boardName = boardName.toString()
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

    const newBoard = data.data?.duplicate_board?.board

    if (!newBoard) {
      throw new Error('Failed to duplicate board: No data returned')
    }

    logger.info('✅ Monday.com board duplicated successfully', { newBoardId: newBoard.id, originalBoardId: boardId, userId })

    return {
      success: true,
      output: {
        newBoardId: newBoard.id,
        newBoardName: newBoard.name,
        originalBoardId: boardId,
        description: newBoard.description,
        boardKind: newBoard.board_kind,
        createdAt: new Date().toISOString()
      },
      message: `Board ${boardId} duplicated successfully. New board ID: ${newBoard.id}`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com duplicate board error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to duplicate Monday.com board'
    }
  }
}
