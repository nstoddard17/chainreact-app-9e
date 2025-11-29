/**
 * Monday.com Columns Handler
 */

import { MondayIntegration, MondayColumn, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

/**
 * Fetch Monday.com columns for a specific board
 */
export const getMondayColumns: MondayDataHandler<MondayColumn> = async (
  integration: MondayIntegration,
  options?: Record<string, any>
) => {
  try {
    validateMondayIntegration(integration)

    const { boardId } = options || {}

    if (!boardId) {
      throw new Error('boardId is required to fetch columns')
    }

    const accessToken = await getMondayAccessToken(integration)

    const query = `
      query($boardId: [ID!]) {
        boards(ids: $boardId) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `

    const data = await makeMondayApiRequest(query, accessToken, {
      boardId: [boardId]
    })

    if (!data.boards || data.boards.length === 0) {
      throw new Error(`Board with ID ${boardId} not found`)
    }

    const columns = (data.boards[0].columns || []).map((column: any): MondayColumn => ({
      id: column.id,
      title: column.title,
      label: column.title,
      value: column.id,
      type: column.type,
      settings_str: column.settings_str
    }))

    logger.debug(`✅ [Monday Columns] Fetched ${columns.length} columns for board ${boardId}`)

    return columns

  } catch (error: any) {
    logger.error('❌ [Monday Columns] Error fetching columns:', error)
    throw new Error(`Failed to fetch Monday.com columns: ${error.message}`)
  }
}
