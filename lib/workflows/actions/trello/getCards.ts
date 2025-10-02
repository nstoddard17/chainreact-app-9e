import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

/**
 * Get cards from a Trello board
 */
export async function getTrelloCards(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "trello")

    // Resolve dynamic values
    const boardId = context.dataFlowManager.resolveVariable(config.boardId)
    const listId = context.dataFlowManager.resolveVariable(config.listId)
    const filter = context.dataFlowManager.resolveVariable(config.filter) || 'open'
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100

    if (!boardId) {
      throw new Error("Board is required")
    }

    // Determine endpoint based on whether list is specified
    let endpoint = ''
    if (listId) {
      endpoint = `https://api.trello.com/1/lists/${listId}/cards`
    } else {
      endpoint = `https://api.trello.com/1/boards/${boardId}/cards/${filter}`
    }

    // Build query params
    const params = new URLSearchParams({
      key: process.env.TRELLO_API_KEY || '',
      token: accessToken,
      limit: limit.toString()
    })

    const response = await fetch(`${endpoint}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Trello API error: ${response.status} - ${errorText}`)
    }

    const cards = await response.json()

    return {
      success: true,
      output: {
        cards: cards || [],
        count: cards?.length || 0
      },
      message: `Successfully retrieved ${cards?.length || 0} cards from board`
    }
  } catch (error: any) {
    console.error('Trello Get Cards error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve cards from Trello'
    }
  }
}
