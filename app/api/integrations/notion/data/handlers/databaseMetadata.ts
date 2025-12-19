/**
 * Notion Database Metadata Handler
 * Fetches database title and description for update operations
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { makeNotionApiRequest, validateNotionIntegration, resolveNotionAccessToken, getNotionRequestOptions } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getNotionDatabaseMetadata: NotionDataHandler = async (integration: NotionIntegration, context?: any): Promise<any> => {
  logger.debug("🔍 Notion database metadata fetcher called")
  logger.debug("🔍 Context:", context)

  try {
    validateNotionIntegration(integration)
    const { workspaceId } = getNotionRequestOptions(context)
    const accessToken = resolveNotionAccessToken(integration, workspaceId)

    // Get the database ID from context
    const databaseId = context?.databaseId || context?.database_id
    if (!databaseId) {
      // Return empty metadata if no database selected
      return {
        title: '',
        description: ''
      }
    }

    logger.debug(`🔍 Fetching metadata for database: ${databaseId}`)

    // Get the database details
    const databaseResponse = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}`,
      accessToken,
      {
        method: 'GET'
      }
    )

    if (!databaseResponse.ok) {
      const errorData = await databaseResponse.json().catch(() => ({}))
      logger.error(`❌ Failed to get database metadata: ${databaseResponse.status}`, errorData)
      throw new Error(`Failed to get database metadata: ${databaseResponse.status}`)
    }

    const database = await databaseResponse.json()

    // Extract title and description
    const title = database.title?.[0]?.plain_text || ''
    const description = database.description?.[0]?.plain_text || ''

    logger.debug(`✅ Database metadata retrieved - Title: "${title}", Description: "${description}"`)

    return {
      title,
      description
    }

  } catch (error: any) {
    logger.error("Error fetching Notion database metadata:", error)
    // Return empty values on error
    return {
      title: '',
      description: ''
    }
  }
}

