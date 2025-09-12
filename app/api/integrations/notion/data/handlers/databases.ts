/**
 * Notion Databases Handler
 */

import { NotionIntegration, NotionDatabase, NotionDataHandler } from '../types'
import { validateNotionIntegration, validateNotionToken, getDatabaseTitle } from '../utils'

/**
 * Fetch Notion databases (simplified version without workspace complexity)
 */
export const getNotionDatabases: NotionDataHandler<NotionDatabase> = async (integration: NotionIntegration, options?: any) => {
  try {
    validateNotionIntegration(integration)
    const targetWorkspaceId = options?.workspaceId
    console.log("🗄️ [Notion Databases] Fetching databases", targetWorkspaceId ? `for workspace: ${targetWorkspaceId}` : '(all workspaces)')

    // Validate and get token
    const tokenResult = await validateNotionToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Token validation failed")
    }

    // Search for databases using Notion API
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        page_size: 100,
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
    
    let databases = (data.results || []).map((database: any): NotionDatabase => ({
      id: database.id,
      name: getDatabaseTitle(database),
      value: database.id,
      label: getDatabaseTitle(database), // Add label for dropdown display
      title: getDatabaseTitle(database),
      url: database.url,
      created_time: database.created_time,
      last_edited_time: database.last_edited_time,
      properties: database.properties,
      parent: database.parent,
      workspace_id: database.parent?.workspace // Try to get workspace from parent
    }))

    // Filter by workspace if specified
    // Note: Notion API doesn't directly provide workspace info, so this is best-effort
    // In production, you might need to store workspace associations separately
    if (targetWorkspaceId) {
      // For now, we'll return all databases when workspace is specified
      // since Notion's API doesn't easily filter by workspace
      console.log(`⚠️ [Notion Databases] Workspace filtering requested but returning all databases (Notion API limitation)`)
    }

    console.log(`✅ [Notion Databases] Retrieved ${databases.length} databases`)
    return databases

  } catch (error: any) {
    console.error("❌ [Notion Databases] Error fetching databases:", error)
    throw error
  }
}