/**
 * Monday.com File Columns Handler
 */

import { MondayIntegration, MondayColumn, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

/**
 * Fetch Monday.com file columns for a specific board
 * Returns only columns of type 'file'
 */
export const getMondayFileColumns: MondayDataHandler<MondayColumn> = async (
  integration: MondayIntegration,
  options?: Record<string, any>
) => {
  try {
    validateMondayIntegration(integration)

    const { boardId } = options || {}

    if (!boardId) {
      throw new Error('boardId is required to fetch file columns')
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

    // Filter to only include file type columns
    const fileColumns = (data.boards[0].columns || [])
      .filter((column: any) => column.type === 'file')
      .map((column: any): MondayColumn => ({
        id: column.id,
        title: column.title,
        label: column.title,
        value: column.id,
        type: column.type,
        settings_str: column.settings_str
      }))

    logger.debug(`✅ [Monday File Columns] Fetched ${fileColumns.length} file columns for board ${boardId}`)

    return fileColumns

  } catch (error: any) {
    logger.error('❌ [Monday File Columns] Error fetching file columns:', error)
    throw new Error(`Failed to fetch Monday.com file columns: ${error.message}`)
  }
}
