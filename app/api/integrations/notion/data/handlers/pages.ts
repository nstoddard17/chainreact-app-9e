/**
 * Notion Pages Handler
 */

import { NotionIntegration, NotionPage, NotionDataHandler } from '../types'
import { validateNotionIntegration, makeNotionApiRequest } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

export const getNotionPages: NotionDataHandler<NotionPage> = async (integration: any, context?: any): Promise<NotionPage[]> => {
  console.log("🔍 Notion pages fetcher called")
  console.log("🔍 Context:", context)
  
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
    const workspaceIds = Object.keys(workspaces)
    
    if (workspaceIds.length === 0) {
      throw new Error("No workspaces found in Notion integration")
    }
    
    console.log(`🔍 Found ${workspaceIds.length} workspaces`)
    
    // Check if we should filter by a specific workspace
    const targetWorkspaceId = context?.workspaceId
    const workspacesToProcess = targetWorkspaceId 
      ? [targetWorkspaceId].filter(id => workspaceIds.includes(id))
      : workspaceIds
    
    if (targetWorkspaceId && workspacesToProcess.length === 0) {
      console.log(`⚠️ Requested workspace ${targetWorkspaceId} not found in user's workspaces`)
      return []
    }
    
    console.log(`🔍 Processing ${workspacesToProcess.length} workspace(s)${targetWorkspaceId ? ` (filtered to: ${targetWorkspaceId})` : ''}`)
    
    // Get all pages from selected workspaces
    const allPages: NotionPage[] = []
    
    for (const workspaceId of workspacesToProcess) {
      const workspace = workspaces[workspaceId]
      console.log(`🔍 Processing workspace: ${workspace.name}`)
      
      try {
        // Make API request to get pages
        const response = await makeNotionApiRequest(
          'https://api.notion.com/v1/search',
          notionIntegration.access_token!,
          {
            method: 'POST',
            body: JSON.stringify({
              filter: {
                property: "object",
                value: "page"
              },
              page_size: 100
            })
          }
        )
        
        if (!response.ok) {
          console.error(`❌ Failed to get pages from workspace ${workspace.name}: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        const pages = data.results || []
        
        console.log(`✅ Got ${pages.length} pages from workspace ${workspace.name}`)
        
        // Transform pages to expected format
        const transformedPages = pages.map((page: any) => ({
          id: page.id,
          title: page.properties?.title?.title?.[0]?.plain_text || 
                 page.properties?.Name?.title?.[0]?.plain_text || 
                 'Untitled',
          value: page.id,
          label: page.properties?.title?.title?.[0]?.plain_text || 
                 page.properties?.Name?.title?.[0]?.plain_text || 
                 'Untitled',
          url: page.url,
          created_time: page.created_time,
          last_edited_time: page.last_edited_time,
          workspace: workspace.name,
          workspaceId: workspaceId,
          object: page.object,
          parent: page.parent,
          archived: page.archived,
          properties: page.properties
        }))
        
        allPages.push(...transformedPages)
        
      } catch (error: any) {
        console.error(`❌ Error processing workspace ${workspace.name}:`, error)
        continue
      }
    }
    
    console.log(`✅ Total pages fetched: ${allPages.length}`)
    return allPages
    
  } catch (error: any) {
    console.error("Error fetching Notion pages:", error)
    throw new Error(error.message || "Error fetching Notion pages")
  }
}