/**
 * Monday.com Groups Handler
 */

import { MondayIntegration, MondayGroup, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

/**
 * Fetch Monday.com groups for a specific board
 */
export const getMondayGroups: MondayDataHandler<MondayGroup> = async (
  integration: MondayIntegration,
  options?: Record<string, any>
) => {
  try {
    validateMondayIntegration(integration)

    const { boardId } = options || {}

    if (!boardId) {
      throw new Error('boardId is required to fetch groups')
    }

    const accessToken = await getMondayAccessToken(integration)

    const query = `
      query($boardId: [ID!]) {
        boards(ids: $boardId) {
          groups {
            id
            title
            color
            position
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

    const groups = (data.boards[0].groups || []).map((group: any): MondayGroup => ({
      id: group.id,
      title: group.title,
      label: group.title,
      value: group.id,
      color: group.color,
      position: group.position
    }))

    logger.debug(`✅ [Monday Groups] Fetched ${groups.length} groups for board ${boardId}`)

    return groups

  } catch (error: any) {
    logger.error('❌ [Monday Groups] Error fetching groups:', error)
    throw new Error(`Failed to fetch Monday.com groups: ${error.message}`)
  }
}
