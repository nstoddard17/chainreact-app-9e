/**
 * Notion Workspaces Handler
 */

import { NotionIntegration, NotionWorkspace, NotionDataHandler } from '../types'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const getNotionWorkspaces: NotionDataHandler<NotionWorkspace> = async (integration: any): Promise<NotionWorkspace[]> => {
  logger.debug('🔍 Notion workspaces fetcher called - fetching workspaces from metadata')
  
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
    logger.debug('📦 Full metadata object:', JSON.stringify(notionIntegration.metadata, null, 2))
    
    // Get workspaces from metadata - check different possible structures
    let workspaces = notionIntegration.metadata?.workspaces || {}
    
    // If workspaces is empty, check if the metadata itself contains workspace data
    if (Object.keys(workspaces).length === 0 && notionIntegration.metadata) {
      // Check if metadata has workspace_id and workspace_name directly
      if (notionIntegration.metadata.workspace_id && notionIntegration.metadata.workspace_name) {
        logger.debug('📦 Found workspace data directly in metadata')
        workspaces = {
          [notionIntegration.metadata.workspace_id]: {
            workspace_id: notionIntegration.metadata.workspace_id,
            workspace_name: notionIntegration.metadata.workspace_name,
            workspace_icon: notionIntegration.metadata.workspace_icon,
            bot_id: notionIntegration.metadata.bot_id,
            owner_type: notionIntegration.metadata.owner_type,
            user_info: notionIntegration.metadata.user_info
          }
        }
      }
    }
    
    logger.debug('📦 Workspaces object to process:', JSON.stringify(workspaces, null, 2))
    
    const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => {
      logger.debug(`🔍 Processing workspace ${id}:`, JSON.stringify(workspace, null, 2))
      return {
        id,
        name: workspace.workspace_name || workspace.name || id, // Use workspace_name (correct property)
        value: id,
        label: workspace.workspace_name || workspace.name || id, // Use workspace_name (correct property)
        icon: workspace.workspace_icon || workspace.icon,
        owner: workspace.owner_type || workspace.owner,
        object: workspace.object || 'workspace'
      }
    })
    
    logger.debug(`✅ Found ${workspaceArray.length} workspaces in metadata`)
    
    return workspaceArray
    
  } catch (error: any) {
    logger.error("Error fetching Notion workspaces:", error)
    throw new Error(error.message || "Error fetching Notion workspaces")
  }
}