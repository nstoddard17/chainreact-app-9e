/**
 * Notion Database Properties Handler
 */

import { NotionIntegration, NotionDatabaseProperty, NotionDataHandler } from '../types'
import { validateNotionIntegration, makeNotionApiRequest } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const getNotionDatabaseProperties: NotionDataHandler<NotionDatabaseProperty> = async (integration: any, context?: any): Promise<NotionDatabaseProperty[]> => {
  logger.debug("🔍 Notion database properties fetcher called")
  logger.debug("🔍 Context:", context)
  
  try {
    // Get the Notion integration - handle both integrationId and userId cases
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError
    
    if (integration.id) {
      // If we have a specific integration ID, use that
      logger.debug(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      // If we have a user ID, find the Notion integration for that user
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
      throw new Error("Database ID is required to fetch properties")
    }
    
    logger.debug(`🔍 Fetching properties for database: ${databaseId}`)
    
    // Make API request to get database details
    const response = await makeNotionApiRequest(
      `https://api.notion.com/v1/databases/${databaseId}`,
      notionIntegration.access_token!,
      {
        method: 'GET'
      }
    )
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ Failed to get database properties: ${response.status}`, errorData)
      throw new Error(`Failed to get database properties: ${response.status}`)
    }
    
    const database = await response.json()
    const properties = database.properties || {}
    
    logger.debug(`✅ Found ${Object.keys(properties).length} properties`)
    
    // Transform properties to expected format
    const transformedProperties = Object.entries(properties).map(([name, property]: [string, any]) => ({
      id: property.id,
      name: name,
      value: name,
      label: name,
      type: property.type,
      property: property,
      databaseId: databaseId,
      databaseTitle: database.title?.[0]?.plain_text || 'Untitled Database'
    }))
    
    return transformedProperties
    
  } catch (error: any) {
    logger.error("Error fetching Notion database properties:", error)
    throw new Error(error.message || "Error fetching Notion database properties")
  }
}