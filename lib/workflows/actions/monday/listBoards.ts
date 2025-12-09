import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * List boards from Monday.com
 */
export async function listMondayBoards(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve configuration values
    const limit = config.limit
      ? await resolveValue(config.limit, input)
      : 50
    const boardKind = config.boardKind
      ? await resolveValue(config.boardKind, input)
      : undefined

    // Get access token
    const accessToken = await getDecryptedAccessToken(userId, 'monday')

    // Build GraphQL query
    let query = `
      query($limit: Int!) {
        boards(limit: $limit) {
          id
          name
          description
          board_kind
          state
          created_at
          updated_at
          owner {
            id
            name
          }
        }
      }
    `

    const variables: Record<string, any> = {
      limit: parseInt(limit.toString()) || 50
    }

    // Add board_kind filter if specified
    if (boardKind) {
      query = `
        query($limit: Int!, $boardKind: BoardKind!) {
          boards(limit: $limit, board_kind: $boardKind) {
            id
            name
            description
            board_kind
            state
            created_at
            updated_at
            owner {
              id
              name
            }
          }
        }
      `
      variables.boardKind = boardKind
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

    const boards = data.data?.boards || []

    logger.info('✅ Monday.com boards listed successfully', { boardCount: boards.length, userId })

    return {
      success: true,
      output: {
        boards: boards,
        count: boards.length,
        boardKind: boardKind
      },
      message: `Retrieved ${boards.length} boards from Monday.com`
    }

  } catch (error: any) {
    logger.error('❌ Monday.com list boards error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to list Monday.com boards'
    }
  }
}
