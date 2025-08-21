/**
 * Notion Workspaces Handler
 */

import { NotionIntegration, NotionWorkspace, NotionDataHandler } from '../types'
import { createAdminClient } from "@/lib/supabase/admin"

export const getNotionWorkspaces: NotionDataHandler<NotionWorkspace> = async (integration: any): Promise<NotionWorkspace[]> => {
  console.log('🔍 Notion workspaces fetcher called - fetching workspaces from metadata')
  
  try {
    // Get the Notion integration - handle both integrationId and userId cases
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError
    
    if (integration.id) {
      // If we have a specific integration ID, use that
      console.log(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      // If we have a user ID, find the Notion integration for that user
      console.log(`🔍 Looking up Notion integration for user: ${integration.userId}`)
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
      console.error('🔍 Integration lookup failed:', integrationError)
      throw new Error("Notion integration not found")
    }
    
    console.log(`🔍 Found integration: ${notionIntegration.id}`)
    
    // Get workspaces from metadata
    const workspaces = notionIntegration.metadata?.workspaces || {}
    const workspaceArray = Object.entries(workspaces).map(([id, workspace]: [string, any]) => ({
      id,
      name: workspace.name,
      value: id,
      label: workspace.name,
      icon: workspace.icon,
      owner: workspace.owner,
      object: workspace.object || 'workspace'
    }))
    
    console.log(`✅ Found ${workspaceArray.length} workspaces in metadata`)
    
    return workspaceArray
    
  } catch (error: any) {
    console.error("Error fetching Notion workspaces:", error)
    throw new Error(error.message || "Error fetching Notion workspaces")
  }
}