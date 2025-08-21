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
    console.log("🗄️ [Notion Databases] Fetching databases")

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
    
    const databases = (data.results || []).map((database: any): NotionDatabase => ({
      id: database.id,
      name: getDatabaseTitle(database),
      value: database.id,
      title: getDatabaseTitle(database),
      url: database.url,
      created_time: database.created_time,
      last_edited_time: database.last_edited_time,
      properties: database.properties,
      parent: database.parent
    }))

    console.log(`✅ [Notion Databases] Retrieved ${databases.length} databases`)
    return databases

  } catch (error: any) {
    console.error("❌ [Notion Databases] Error fetching databases:", error)
    throw error
  }
}