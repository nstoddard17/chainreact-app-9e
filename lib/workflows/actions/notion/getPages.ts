import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

const NOTION_API_VERSION = "2022-06-28"

/**
 * Get pages from a Notion database
 */
export async function notionGetPages(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    // Resolve dynamic values
    const databaseId = context.dataFlowManager.resolveVariable(config.database)
    const filterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const filterValue = context.dataFlowManager.resolveVariable(config.filterValue)
    const sortProperty = context.dataFlowManager.resolveVariable(config.sortProperty)
    const sortDirection = context.dataFlowManager.resolveVariable(config.sortDirection) || 'ascending'
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100

    if (!databaseId) {
      throw new Error("Database is required")
    }

    // Build query payload
    const payload: any = {
      page_size: Math.min(limit, 100)
    }

    // Add filter if provided
    if (filterProperty && filterValue) {
      payload.filter = {
        property: filterProperty,
        rich_text: {
          contains: filterValue
        }
      }
    }

    // Add sort if provided
    if (sortProperty) {
      payload.sorts = [{
        property: sortProperty,
        direction: sortDirection
      }]
    }

    // Query database
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const data = await response.json()

    return {
      success: true,
      output: {
        pages: data.results || [],
        count: data.results?.length || 0,
        hasMore: data.has_more || false
      },
      message: `Successfully retrieved ${data.results?.length || 0} pages from database`
    }
  } catch (error: any) {
    logger.error('Notion Get Pages error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve pages from Notion'
    }
  }
}
