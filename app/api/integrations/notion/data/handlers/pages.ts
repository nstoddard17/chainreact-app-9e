/**
 * Notion Pages Handler
 */

import { NotionIntegration, NotionPage, NotionDataHandler } from '../types'
import { validateNotionIntegration, makeNotionApiRequest } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

// Simple in-memory cache for pages (expires after 5 minutes)
const pageCache = new Map<string, { data: NotionPage[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const getNotionPages: NotionDataHandler<NotionPage> = async (integration: any, context?: any): Promise<NotionPage[]> => {
  console.log("🔍 Notion pages fetcher called")
  console.log("🔍 Context:", context)
  
  try {
    // Check cache first
    const cacheKey = `${integration.id || integration.userId}_${context?.workspace || 'all'}`
    const cached = pageCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("✅ Returning cached pages:", cached.data.length)
      return cached.data
    }
    // Import decrypt function
    const { decrypt } = await import("@/lib/security/encryption")
    const encryptionKey = process.env.ENCRYPTION_KEY!
    
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
      const workspaceName = workspace?.workspace_name || workspace?.name || workspaceId
      console.log(`🔍 Processing workspace: ${workspaceName}`)
      
      try {
        // Get and decrypt the access token for this workspace
        const encryptedToken = workspace?.access_token || notionIntegration.access_token
        
        if (!encryptedToken) {
          console.error(`❌ No access token found for workspace ${workspaceName}`)
          continue
        }
        
        // Decrypt the access token
        const workspaceAccessToken = decrypt(encryptedToken, encryptionKey)
        
        // Optimize by fetching fewer pages initially and sorting by recently edited
        const response = await makeNotionApiRequest(
          'https://api.notion.com/v1/search',
          workspaceAccessToken,
          {
            method: 'POST',
            body: JSON.stringify({
              filter: {
                property: "object",
                value: "page"
              },
              sort: {
                direction: "descending",
                timestamp: "last_edited_time"
              },
              page_size: 50 // Reduced from 100 for faster initial load
            })
          }
        )
        
        if (!response.ok) {
          console.error(`❌ Failed to get pages from workspace ${workspaceName}: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        const allResults = data.results || []
        
        // Filter to only include actual pages (not databases)
        const pages = allResults.filter((item: any) => item.object === 'page')
        
        console.log(`✅ Got ${pages.length} pages (filtered from ${allResults.length} total results) from workspace ${workspaceName}`)
        
        // Removed verbose logging for performance
        
        // Transform pages to expected format - extract title from various possible locations
        const transformedPages = pages
          .filter((page: any) => !page.archived) // Filter out archived pages
          .map((page: any) => {
            // Try to extract title from various property names Notion uses
            let title = 'Untitled'
            
            // Check all properties for title-like fields
            if (page.properties) {
              // Common title property names in Notion databases
              const titlePropertyNames = [
                'title', 'Title', 'Name', 'name', 'Page', 
                'Task Name', 'Task name', 'Project name', 'Project Name',
                'Item', 'item', 'Task', 'task'
              ]
              
              // First try known property names
              for (const propName of titlePropertyNames) {
                if (page.properties[propName]) {
                  const prop = page.properties[propName]
                  if (prop.type === 'title' && prop.title?.length > 0) {
                    title = prop.title[0]?.plain_text || title
                    break
                  } else if (prop.title?.length > 0) {
                    title = prop.title[0]?.plain_text || title
                    break
                  }
                }
              }
              
              // If still untitled, dynamically find ANY property with type 'title'
              if (title === 'Untitled') {
                for (const [propName, prop] of Object.entries(page.properties)) {
                  if ((prop as any).type === 'title') {
                    if ((prop as any).title?.length > 0) {
                      title = (prop as any).title[0]?.plain_text || 'Untitled'
                    } else {
                      // Even if empty, we found the title field - page is truly untitled
                      title = 'Untitled'
                    }
                    break
                  }
                }
              }
            }
            
            // Skip truly empty pages (database entries without content)
            const hasContent = title !== 'Untitled' || 
                              page.last_edited_time !== page.created_time ||
                              (page.properties && Object.keys(page.properties).some(key => {
                                const prop = page.properties[key]
                                return prop.type !== 'title' && 
                                       (prop.rich_text?.length > 0 || 
                                        prop.number !== null || 
                                        prop.checkbox === true ||
                                        prop.select?.name ||
                                        prop.multi_select?.length > 0 ||
                                        prop.date?.start ||
                                        prop.people?.length > 0 ||
                                        prop.files?.length > 0 ||
                                        prop.url ||
                                        prop.email ||
                                        prop.phone_number)
                              }))
            
            return {
              id: page.id,
              title: title,
              value: page.id,
              label: title !== 'Untitled' ? title : `Page (${page.id.substring(0, 8)}...)`,
              url: page.url,
              created_time: page.created_time,
              last_edited_time: page.last_edited_time,
              workspace: workspaceName,
              workspaceId: workspaceId,
              object: page.object,
              parent: page.parent,
              archived: page.archived,
              properties: page.properties,
              hasContent: hasContent
            }
          })
          .filter((page: any) => page.hasContent) // Only keep pages with actual content
        
        allPages.push(...transformedPages)
        
      } catch (error: any) {
        console.error(`❌ Error processing workspace ${workspaceName}:`, error)
        continue
      }
    }
    
    console.log(`✅ Total pages fetched: ${allPages.length}`)
    
    // Store in cache
    pageCache.set(cacheKey, {
      data: allPages,
      timestamp: Date.now()
    })
    
    return allPages
    
  } catch (error: any) {
    console.error("Error fetching Notion pages:", error)
    throw new Error(error.message || "Error fetching Notion pages")
  }
}