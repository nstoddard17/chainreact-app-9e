/**
 * Monday.com Boards Handler
 */

import { MondayIntegration, MondayBoard, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

/**
 * Fetch Monday.com boards for the authenticated user
 */
export const getMondayBoards: MondayDataHandler<MondayBoard> = async (integration: MondayIntegration) => {
  try {
    validateMondayIntegration(integration)

    const accessToken = getMondayAccessToken(integration)

    const query = `
      query {
        boards(limit: 100) {
          id
          name
          description
          board_kind
          state
        }
      }
    `

    const data = await makeMondayApiRequest(query, accessToken)

    const boards = (data.boards || []).map((board: any): MondayBoard => ({
      id: board.id,
      name: board.name,
      label: board.name,
      value: board.id,
      description: board.description,
      board_kind: board.board_kind,
      state: board.state
    }))

    logger.debug(`✅ [Monday Boards] Fetched ${boards.length} boards`)

    return boards

  } catch (error: any) {
    logger.error('❌ [Monday Boards] Error fetching boards:', {
      message: error.message,
      status: error.status,
      stack: error.stack
    })
    throw new Error(`Failed to fetch Monday.com boards: ${error.message}`)
  }
}
