/**
 * Notion Database Metadata Handler
 * Fetches database title and description for update operations
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { makeNotionApiRequest } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const getNotionDatabaseMetadata: NotionDataHandler = async (integration: any, context?: any): Promise<any> => {
  logger.debug("🔍 Notion database metadata fetcher called")
  logger.debug("🔍 Context:", context)

  try {
    // Get the Notion integration
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError

    if (integration.id) {
      logger.debug(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      logger.debug(`🔍 Looking up Notion integration for user: ${integration.userId}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', integration.userId)
        .eq('provider', 'notion')
        .eq('status', 'connected')
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else {
      throw new Error("No integration ID or user ID provided")
    }

    if (integrationError || !notionIntegration) {
      logger.error('🔍 Integration lookup failed:', integrationError)
      throw new Error("Notion integration not found")
    }

    logger.debug(`🔍 Found integration: ${notionIntegration.id}`)

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
      notionIntegration.access_token!,
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