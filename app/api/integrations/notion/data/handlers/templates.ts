/**
 * Notion Templates Handler
 */

import { NotionIntegration, NotionTemplate, NotionDataHandler } from '../types'
import { validateNotionIntegration, validateNotionToken, makeNotionApiRequest, getPageTitle } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Notion templates (pages with "template" in the title)
 */
export const getNotionTemplates: NotionDataHandler<NotionTemplate> = async (integration: NotionIntegration) => {
  try {
    validateNotionIntegration(integration)
    logger.debug("📄 [Notion Templates] Fetching templates")

    // Validate and get token
    const tokenResult = await validateNotionToken(integration)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Token validation failed")
    }

    // Search for all pages and filter for templates on the client side
    // Notion API doesn't support filtering by title content in search
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
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
    
    // Filter pages that contain "template" in their title (case insensitive)
    const templatePages = (data.results || []).filter((page: any) => {
      const title = getPageTitle(page).toLowerCase()
      return title.includes('template')
    })
    
    const templates = templatePages.map((template: any): NotionTemplate => ({
      id: template.id,
      name: getPageTitle(template),
      value: template.id,
      description: `Template: ${getPageTitle(template)}`,
      type: 'page',
      properties: template.properties
    }))

    logger.debug(`✅ [Notion Templates] Retrieved ${templates.length} templates`)
    return templates

  } catch (error: any) {
    logger.error("❌ [Notion Templates] Error fetching templates:", error)
    throw error
  }
}