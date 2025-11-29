/**
 * Monday.com Items Handler
 */

import { MondayIntegration, MondayItem, MondayDataHandler } from '../types'
import { validateMondayIntegration, makeMondayApiRequest, getMondayAccessToken } from '../utils'
import { logger } from '@/lib/utils/logger'

/**
 * Fetch Monday.com items for a specific board
 */
export const getMondayItems: MondayDataHandler<MondayItem> = async (
  integration: MondayIntegration,
  options?: Record<string, any>
) => {
  try {
    validateMondayIntegration(integration)

    const { boardId } = options || {}

    if (!boardId) {
      throw new Error('boardId is required to fetch items')
    }

    const accessToken = await getMondayAccessToken(integration)

    const query = `
      query($boardId: [ID!]) {
        boards(ids: $boardId) {
          items_page(limit: 100) {
            items {
              id
              name
              group {
                id
                title
              }
            }
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

    const items = (data.boards[0].items_page?.items || []).map((item: any): MondayItem => ({
      id: item.id,
      name: item.name,
      label: item.name,
      value: item.id,
      groupId: item.group?.id,
      groupTitle: item.group?.title
    }))

    logger.debug(`✅ [Monday Items] Fetched ${items.length} items for board ${boardId}`)

    return items

  } catch (error: any) {
    logger.error('❌ [Monday Items] Error fetching items:', error)
    throw new Error(`Failed to fetch Monday.com items: ${error.message}`)
  }
}
