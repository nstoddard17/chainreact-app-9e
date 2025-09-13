/**
 * Notion Teamspaces Handler
 */

import { NotionIntegration, NotionDataHandler } from '../types'
import { validateNotionToken } from '../utils'

export interface NotionTeamspace {
  id: string
  name: string
  value: string
  label: string
  type: 'team_space'
  icon?: string
  created_time?: string
  last_edited_time?: string
  workspace_id?: string
}

/**
 * Fetch Notion teamspaces
 * Note: Notion API doesn't have a direct endpoint for teamspaces,
 * so we'll search for top-level pages/databases that represent teamspaces
 */
export const getNotionTeamspaces: NotionDataHandler<NotionTeamspace> = async (integration: NotionIntegration, options?: any) => {
  try {
    // Check for both workspace and workspaceId for compatibility
    const targetWorkspaceId = options?.workspace || options?.workspaceId
    console.log("🏢 [Notion Teamspaces] Fetching teamspaces", targetWorkspaceId ? `for workspace: ${targetWorkspaceId}` : '(all workspaces)')

    // Get workspace-specific token if workspace is specified
    let tokenToUse = integration.access_token
    
    if (targetWorkspaceId && integration.metadata?.workspaces) {
      const workspace = integration.metadata.workspaces[targetWorkspaceId]
      if (workspace?.access_token) {
        console.log("🔑 [Notion Teamspaces] Using workspace-specific token")
        tokenToUse = workspace.access_token
      }
    }

    // Create a temporary integration object with the correct token
    const integrationWithToken = { ...integration, access_token: tokenToUse }
    
    // Validate and get token
    const tokenResult = await validateNotionToken(integrationWithToken)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Token validation failed")
    }

    // Search for all pages and databases to identify teamspaces
    // Teamspaces are typically top-level pages with specific properties
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        page_size: 100,
        sort: {
          direction: "ascending",
          timestamp: "last_edited_time"
        }
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Notion authentication expired. Please reconnect your account.")
      }
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const data = await response.json()
    
    console.log(`🔍 [Notion Teamspaces] Found ${data.results?.length || 0} total search results`)
    
    // DEBUG: Log ALL items to see what we're getting from Notion
    console.log(`📋 [Notion Teamspaces] ALL ITEMS FROM API:`)
    ;(data.results || []).forEach((item: any, index: number) => {
      // Extract title for logging
      let title = "Untitled"
      if (item.object === "database" && item.title?.length > 0) {
        title = item.title[0]?.plain_text || item.title[0]?.text?.content || title
      } else if (item.properties) {
        for (const [propName, prop] of Object.entries(item.properties)) {
          if ((prop as any).type === 'title' && (prop as any).title?.length > 0) {
            title = (prop as any).title[0]?.plain_text || (prop as any).title[0]?.text?.content || title
            break
          }
        }
      }
      
      console.log(`  ${index + 1}. ${item.object.toUpperCase()}: "${title}"`)
      console.log(`     ID: ${item.id}`)
      console.log(`     Parent Type: ${item.parent?.type}`)
      console.log(`     Parent ID: ${item.parent?.page_id || item.parent?.database_id || item.parent?.workspace || 'N/A'}`)
      console.log(`     Icon: ${item.icon?.emoji || item.icon?.type || 'none'}`)
      console.log(`     Created: ${item.created_time}`)
      console.log(`     ---`)
    })
    
    console.log(`\n🎯 [Notion Teamspaces] PLEASE IDENTIFY WHICH ITEM ABOVE IS YOUR TEAMSPACE\n`)
    
    // TEMPORARILY: Show ALL items in the dropdown for debugging
    // Once we identify the pattern for teamspaces, we'll filter properly
    const teamspaces = (data.results || [])
      // No filtering for now - show everything
      .slice(0, 20) // Limit to first 20 items to avoid overwhelming the dropdown
      .map((item: any): NotionTeamspace => {
        // Try to extract title from various property names
        let title = "Untitled"
        
        // For databases, the title is directly in the title property array
        if (item.object === "database" && item.title?.length > 0) {
          title = item.title[0]?.plain_text || item.title[0]?.text?.content || title
        } 
        // For pages, check all properties for title-type fields
        else if (item.properties) {
          for (const [propName, prop] of Object.entries(item.properties)) {
            if ((prop as any).type === 'title' && (prop as any).title?.length > 0) {
              title = (prop as any).title[0]?.plain_text || (prop as any).title[0]?.text?.content || title
              break
            }
          }
        }
        
        // Add parent info to help identify hierarchy
        let parentInfo = ""
        if (item.parent?.type === "workspace") {
          parentInfo = " [ROOT]"
        } else if (item.parent?.type === "page_id") {
          parentInfo = " [in page]"
        } else if (item.parent?.type === "database_id") {
          parentInfo = " [in database]"
        }
        
        const label = `${item.icon?.emoji || (item.object === 'database' ? '📊' : '📁')} ${title}${parentInfo} (${item.object})`
        
        console.log(`📁 [Notion Teamspaces] Found ${item.object}: "${title}" (${item.id})`)
        
        return {
          id: item.id,
          name: title,
          value: item.id,
          label: label,
          type: 'team_space',
          icon: item.icon?.emoji || item.icon?.type,
          created_time: item.created_time,
          last_edited_time: item.last_edited_time,
          workspace_id: targetWorkspaceId
        }
      })
      // Remove duplicates based on ID
      .filter((teamspace: NotionTeamspace, index: number, self: NotionTeamspace[]) => 
        index === self.findIndex((t) => t.id === teamspace.id)
      )

    // Add a default "Root/Workspace" option for items not in a teamspace
    const rootOption: NotionTeamspace = {
      id: "workspace_root",
      name: "Workspace Root",
      value: "workspace_root",
      label: "🏠 Workspace Root (No Teamspace)",
      type: 'team_space',
      workspace_id: targetWorkspaceId
    }

    const allTeamspaces = [rootOption, ...teamspaces]

    console.log(`✅ [Notion Teamspaces] Retrieved ${allTeamspaces.length} teamspaces (including root)`)
    console.log(`📋 [Notion Teamspaces] Teamspace list:`, allTeamspaces.map(t => ({ id: t.id, name: t.name })))
    return allTeamspaces

  } catch (error: any) {
    console.error("❌ [Notion Teamspaces] Error fetching teamspaces:", error)
    throw error
  }
}