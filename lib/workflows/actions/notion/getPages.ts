import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { getCachedDataSourceId, cacheDataSourceId } from './dataSourceCache'

import { logger } from '@/lib/utils/logger'

const NOTION_API_VERSION = "2025-09-03"

/**
 * Get pages from a Notion database or data source
 * Supports both legacy database queries and new data source queries (API 2025-09-03)
 */
export async function notionGetPages(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    // Resolve dynamic values
    const databaseId = context.dataFlowManager.resolveVariable(config.database)
    const dataSourceId = context.dataFlowManager.resolveVariable(config.dataSource)
    const filterProperty = context.dataFlowManager.resolveVariable(config.filterProperty)
    const filterValue = context.dataFlowManager.resolveVariable(config.filterValue)
    const sortProperty = context.dataFlowManager.resolveVariable(config.sortProperty)
    const sortDirection = context.dataFlowManager.resolveVariable(config.sortDirection) || 'ascending'
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100

    // Determine which ID to use (prefer data source for new API)
    let targetId = dataSourceId || databaseId
    let useDataSourceEndpoint = !!dataSourceId

    if (!targetId) {
      throw new Error("Database or Data Source is required")
    }

    // If only database ID is provided, try to get data source ID
    // Check cache first to avoid redundant API calls
    if (!dataSourceId && databaseId) {
      // Try cache first
      const cachedDataSourceId = getCachedDataSourceId(databaseId)

      if (cachedDataSourceId) {
        targetId = cachedDataSourceId
        useDataSourceEndpoint = true
        logger.debug('Using cached data source mapping')
      } else {
        // Cache miss - fetch from API
        try {
          // Add timeout to prevent hanging on slow API responses
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

          const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": NOTION_API_VERSION,
              "Content-Type": "application/json"
            },
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (dbResponse.ok) {
            const dbData = await dbResponse.json()
            // Get the first data source if available
            if (dbData.data_sources && dbData.data_sources.length > 0) {
              targetId = dbData.data_sources[0].id
              useDataSourceEndpoint = true
              // Cache the mapping for future requests
              cacheDataSourceId(databaseId, targetId)
              logger.debug('Auto-detected and cached data source for query operation')
            }
          }
        } catch (err) {
          // Log error without sensitive details
          logger.warn('Failed to fetch data source metadata, using database ID fallback')
        }
      }
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

    // Query using appropriate endpoint
    const endpoint = useDataSourceEndpoint
      ? `https://api.notion.com/v1/data_sources/${targetId}/query`
      : `https://api.notion.com/v1/databases/${targetId}/query`

    logger.debug(`Querying Notion ${useDataSourceEndpoint ? 'data source' : 'database'}`)

    const response = await fetch(endpoint, {
      method: useDataSourceEndpoint ? 'PATCH' : 'POST',
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
        hasMore: data.has_more || false,
        dataSourceId: useDataSourceEndpoint ? targetId : undefined
      },
      message: `Successfully retrieved ${data.results?.length || 0} pages from ${useDataSourceEndpoint ? 'data source' : 'database'}`
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
