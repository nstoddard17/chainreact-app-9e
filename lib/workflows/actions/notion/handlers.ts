import { ActionResult } from '../core/executeWait'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

const NOTION_API_VERSION = "2025-09-03"

/**
 * Output Schema Type Definition
 * Defines the structure of outputs from action handlers
 */
export interface OutputField {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
}

/**
 * Helper function to make Notion API requests
 */
async function notionApiRequest(
  endpoint: string,
  method: string,
  accessToken: string,
  body?: any
) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Create a new page in Notion
 */
export async function notionCreatePage(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    // Resolve dynamic values
    const parentType = context.dataFlowManager.resolveVariable(config.parent_type)
    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const parentPageId = context.dataFlowManager.resolveVariable(config.parent_page_id)
    const title = context.dataFlowManager.resolveVariable(config.title)
    const properties = context.dataFlowManager.resolveVariable(config.properties) || {}
    
    // Build page payload
    const payload: any = {
      properties: {
        ...properties
      }
    }

    // Set parent
    if (parentType === "database" && databaseId) {
      payload.parent = { database_id: databaseId }
      // For database pages, title goes in the Name property or the title property
      const titleProperty = Object.keys(properties).find(key =>
        properties[key].type === "title" || key.toLowerCase() === "name" || key.toLowerCase() === "title"
      ) || "Name"

      payload.properties[titleProperty] = {
        title: [{ type: "text", text: { content: title } }]
      }
    } else if (parentType === "page" && parentPageId) {
      payload.parent = { page_id: parentPageId }
      payload.properties = {
        title: {
          title: [{ type: "text", text: { content: title } }]
        }
      }
    } else {
      throw new Error("Parent location is required. Please select either a database or a parent page.")
    }

    // Add icon if provided
    if (config.icon_type === "emoji" && config.icon_emoji) {
      payload.icon = { type: "emoji", emoji: config.icon_emoji }
    } else if (config.icon_type === "external" && config.icon_url) {
      payload.icon = { type: "external", external: { url: config.icon_url } }
    }

    // Add cover if provided
    if (config.cover_type === "external" && config.cover_url) {
      payload.cover = { type: "external", external: { url: config.cover_url } }
    }

    // Add content blocks if provided
    if (config.content_blocks) {
      payload.children = config.content_blocks
    }

    const result = await notionApiRequest("/pages", "POST", accessToken, payload)

    return {
      success: true,
      output: {
        page_id: result.id,
        url: result.url,
        created_time: result.created_time,
        last_edited_time: result.last_edited_time
      }
    }
  } catch (error: any) {
    logger.error("Notion create page error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create Notion page"
    }
  }
}

/**
 * Update page properties
 */
export async function notionUpdatePage(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    let properties = context.dataFlowManager.resolveVariable(config.properties) || {}
    const archived = context.dataFlowManager.resolveVariable(config.archived)
    const title = context.dataFlowManager.resolveVariable(config.title)

    // Process properties to ensure proper format
    const processedProperties: any = {}

    // Handle title property - it might come from config.title or be in properties
    let titleHandled = false

    // Check if title is provided as a separate config field
    if (title && title !== '') {
      processedProperties.title = {
        title: [
          {
            type: 'text',
            text: {
              content: title
            }
          }
        ]
      }
      titleHandled = true
    }

    for (const [key, value] of Object.entries(properties)) {
      // Handle title property specially
      if (key === 'title') {
        if (titleHandled) {
          // Skip if we already handled title from config
          continue
        }
        // Check if title needs formatting
        if (typeof value === 'string' && value !== '') {
          // Format string title properly
          processedProperties.title = {
            title: [
              {
                type: 'text',
                text: {
                  content: value
                }
              }
            ]
          }
        } else if (typeof value === 'object' && value !== null && value.title) {
          // Already formatted, use as-is
          processedProperties.title = value
        }
        // Skip if empty or invalid
        continue
      }

      // List of keys that are block content, not page properties
      const blockContentKeys = [
        'todo-items',
        'toggle-content',
        'document-embed',
        'code-block',
        'callout-content'
      ]

      // Skip block content fields - these should be handled through blocks API
      if (blockContentKeys.some(blockKey => key.includes(blockKey))) {
        logger.debug(`Skipping block content field: ${key}`)
        continue
      }

      // Skip properties that contain '-content' suffix as they're usually block content
      if (key.includes('-content')) {
        logger.debug(`Skipping content field: ${key}`)
        continue
      }

      // Skip empty values
      if (value === undefined || value === null || value === '') {
        continue
      }

      // For object values, check if they're properly formatted Notion properties
      if (typeof value === 'object' && value !== null) {
        // Check if this looks like a Notion property (has a type field)
        if (value.type && typeof value.type === 'string') {
          // This appears to be a properly formatted Notion property
          processedProperties[key] = value
        } else if (value.items || value.blocks || value.children) {
          // This looks like block content, skip it
          logger.debug(`Skipping property ${key} - appears to be block content`)
          continue
        } else {
          // For other objects, add them as-is and let Notion API validate
          processedProperties[key] = value
        }
      } else {
        // Add simple string/number/boolean values
        processedProperties[key] = value
      }
    }

    properties = processedProperties

    // Debug logging
    logger.debug('Processed properties for Notion update:', JSON.stringify(properties, null, 2))

    // Only include properties in payload if we have any to update
    const payload: any = {}
    if (Object.keys(properties).length > 0) {
      payload.properties = properties
    }

    if (archived !== undefined) {
      payload.archived = archived
    }

    // Handle icon update
    if (config.icon_type === "emoji" && config.icon_emoji) {
      payload.icon = { type: "emoji", emoji: config.icon_emoji }
    } else if (config.icon_type === "external" && config.icon_url) {
      payload.icon = { type: "external", external: { url: config.icon_url } }
    } else if (config.icon_type === "remove") {
      payload.icon = null
    }

    // Handle cover update
    if (config.cover_type === "external" && config.cover_url) {
      payload.cover = { type: "external", external: { url: config.cover_url } }
    } else if (config.cover_type === "remove") {
      payload.cover = null
    }

    // Check if we have anything to update
    if (Object.keys(payload).length === 0) {
      logger.debug('No fields to update for Notion page')
      return {
        success: true,
        output: {
          page_id: pageId,
          message: 'No changes to apply'
        }
      }
    }

    logger.debug('Final payload for Notion update:', JSON.stringify(payload, null, 2))

    const result = await notionApiRequest(`/pages/${pageId}`, "PATCH", accessToken, payload)

    return {
      success: true,
      output: {
        page_id: result.id,
        url: result.url,
        last_edited_time: result.last_edited_time
      }
    }
  } catch (error: any) {
    logger.error("Notion update page error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to update Notion page"
    }
  }
}

/**
 * Retrieve page details
 */
export async function notionRetrievePage(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    
    const result = await notionApiRequest(`/pages/${pageId}`, "GET", accessToken)

    return {
      success: true,
      output: {
        page_id: result.id,
        url: result.url,
        properties: result.properties,
        parent: result.parent,
        created_time: result.created_time,
        last_edited_time: result.last_edited_time,
        archived: result.archived
      }
    }
  } catch (error: any) {
    logger.error("Notion retrieve page error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to retrieve Notion page"
    }
  }
}

/**
 * Archive or unarchive a page
 */
export async function notionArchivePage(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const archived = config.archived === "true"
    
    const result = await notionApiRequest(`/pages/${pageId}`, "PATCH", accessToken, { archived })

    return {
      success: true,
      output: {
        page_id: result.id,
        archived: result.archived
      }
    }
  } catch (error: any) {
    logger.error("Notion archive page error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to archive/unarchive Notion page"
    }
  }
}

/**
 * Create a new database
 */
export async function notionCreateDatabase(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const parentType = context.dataFlowManager.resolveVariable(config.parent_type)
    const parentPageId = context.dataFlowManager.resolveVariable(config.parent_page_id)
    const title = context.dataFlowManager.resolveVariable(config.title)
    const description = context.dataFlowManager.resolveVariable(config.description)
    const isInline = config.is_inline === "true"
    const propertiesConfig = context.dataFlowManager.resolveVariable(config.properties_config) || {}
    
    const payload: any = {
      title: [{ type: "text", text: { content: title } }],
      properties: propertiesConfig,
      is_inline: isInline
    }

    // Set parent
    if (parentType === "page" && parentPageId) {
      payload.parent = { page_id: parentPageId }
    } else {
      payload.parent = { type: "workspace", workspace: true }
    }

    if (description) {
      payload.description = [{ type: "text", text: { content: description } }]
    }

    const result = await notionApiRequest("/databases", "POST", accessToken, payload)

    return {
      success: true,
      output: {
        database_id: result.id,
        url: result.url,
        title: title,
        properties: result.properties
      }
    }
  } catch (error: any) {
    logger.error("Notion create database error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create Notion database"
    }
  }
}

/**
 * Query a database
 */
export async function notionQueryDatabase(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const filterType = context.dataFlowManager.resolveVariable(config.filter_type)
    const pageSize = parseInt(config.page_size) || 100
    const startCursor = context.dataFlowManager.resolveVariable(config.start_cursor)
    
    const payload: any = {
      page_size: pageSize
    }

    if (startCursor) {
      payload.start_cursor = startCursor
    }

    // Add filter if specified
    if (filterType === "property" && config.filter_condition) {
      payload.filter = config.filter_condition
    }

    // Add sorts if specified
    if (config.sorts) {
      payload.sorts = config.sorts
    }

    const result = await notionApiRequest(`/databases/${databaseId}/query`, "POST", accessToken, payload)

    return {
      success: true,
      output: {
        results: result.results,
        has_more: result.has_more,
        next_cursor: result.next_cursor,
        total_results: result.results.length
      }
    }
  } catch (error: any) {
    logger.error("Notion query database error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to query Notion database"
    }
  }
}

/**
 * Update a database
 */
export async function notionUpdateDatabase(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const title = context.dataFlowManager.resolveVariable(config.title)
    const description = context.dataFlowManager.resolveVariable(config.description)
    const propertiesUpdate = context.dataFlowManager.resolveVariable(config.properties_update)
    const archived = config.archived
    
    const payload: any = {}

    if (title) {
      payload.title = [{ type: "text", text: { content: title } }]
    }

    if (description) {
      payload.description = [{ type: "text", text: { content: description } }]
    }

    if (propertiesUpdate) {
      payload.properties = propertiesUpdate
    }

    if (archived !== undefined) {
      payload.archived = archived
    }

    const result = await notionApiRequest(`/databases/${databaseId}`, "PATCH", accessToken, payload)

    return {
      success: true,
      output: {
        database_id: result.id,
        url: result.url,
        last_edited_time: result.last_edited_time
      }
    }
  } catch (error: any) {
    logger.error("Notion update database error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to update Notion database"
    }
  }
}

/**
 * Append blocks to a page
 */
export async function notionAppendBlocks(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const blocks = context.dataFlowManager.resolveVariable(config.blocks)
    const after = context.dataFlowManager.resolveVariable(config.after)

    logger.debug('📝 notionAppendBlocks - config:', config)
    logger.debug('📝 notionAppendBlocks - resolved blocks:', blocks)

    // Ensure blocks is an array
    const blocksArray = Array.isArray(blocks) ? blocks : []

    // Don't make API call if there are no blocks to append
    if (blocksArray.length === 0) {
      logger.debug('📝 notionAppendBlocks - No blocks to append, skipping')
      return {
        success: true,
        output: {
          message: 'No blocks to append',
          page_id: pageId
        }
      }
    }

    const payload: any = {
      children: blocksArray
    }

    if (after) {
      payload.after = after
    }

    const result = await notionApiRequest(`/blocks/${pageId}/children`, "PATCH", accessToken, payload)

    return {
      success: true,
      output: {
        blocks: result.results,
        page_id: pageId
      }
    }
  } catch (error: any) {
    logger.error("Notion append blocks error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to append blocks to Notion page"
    }
  }
}

/**
 * Update a block
 */
export async function notionUpdateBlock(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const blockId = context.dataFlowManager.resolveVariable(config.block_id)
    const blockContent = context.dataFlowManager.resolveVariable(config.block_content)
    const archived = config.archived

    logger.debug('📝 notionUpdateBlock - Updating block:', {
      blockId,
      blockContent
    })

    const payload: any = blockContent

    if (archived !== undefined) {
      payload.archived = archived
    }

    const result = await notionApiRequest(`/blocks/${blockId}`, "PATCH", accessToken, payload)

    return {
      success: true,
      output: {
        block_id: result.id,
        type: result.type,
        last_edited_time: result.last_edited_time
      }
    }
  } catch (error: any) {
    logger.error("Notion update block error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to update Notion block"
    }
  }
}

/**
 * Delete a block
 */
export async function notionDeleteBlock(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    const blockId = context.dataFlowManager.resolveVariable(config.block_id)
    
    const result = await notionApiRequest(`/blocks/${blockId}`, "DELETE", accessToken)

    return {
      success: true,
      output: {
        block_id: result.id,
        archived: true
      }
    }
  } catch (error: any) {
    logger.error("Notion delete block error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to delete Notion block"
    }
  }
}

/**
 * Get block children
 */
export async function notionRetrieveBlockChildren(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const blockId = context.dataFlowManager.resolveVariable(config.block_id)
    const pageSize = parseInt(config.page_size) || 100
    
    const params = new URLSearchParams({ page_size: pageSize.toString() })
    const result = await notionApiRequest(`/blocks/${blockId}/children?${params}`, "GET", accessToken)

    return {
      success: true,
      output: {
        children: result.results,
        has_more: result.has_more,
        next_cursor: result.next_cursor
      }
    }
  } catch (error: any) {
    logger.error("Notion retrieve block children error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to retrieve block children"
    }
  }
}

/**
 * List all users
 */
export async function notionListUsers(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    const pageSize = parseInt(config.page_size) || 100
    
    const params = new URLSearchParams({ page_size: pageSize.toString() })
    const result = await notionApiRequest(`/users?${params}`, "GET", accessToken)

    return {
      success: true,
      output: {
        users: result.results,
        has_more: result.has_more,
        next_cursor: result.next_cursor
      }
    }
  } catch (error: any) {
    logger.error("Notion list users error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to list Notion users"
    }
  }
}

/**
 * Retrieve user details
 */
export async function notionRetrieveUser(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    const userId = context.dataFlowManager.resolveVariable(config.user_id)
    
    const result = await notionApiRequest(`/users/${userId}`, "GET", accessToken)

    return {
      success: true,
      output: {
        user_id: result.id,
        name: result.name,
        email: result.person?.email,
        type: result.type,
        avatar_url: result.avatar_url
      }
    }
  } catch (error: any) {
    logger.error("Notion retrieve user error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to retrieve Notion user"
    }
  }
}

/**
 * Create a comment
 */
export async function notionCreateComment(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const parentType = context.dataFlowManager.resolveVariable(config.parent_type)
    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const discussionId = context.dataFlowManager.resolveVariable(config.discussion_id)
    const richText = context.dataFlowManager.resolveVariable(config.rich_text)
    
    const payload: any = {
      rich_text: typeof richText === "string" 
        ? [{ type: "text", text: { content: richText } }]
        : richText
    }

    if (parentType === "page" && pageId) {
      payload.parent = { page_id: pageId }
    } else if (parentType === "discussion" && discussionId) {
      payload.discussion_id = discussionId
    }

    const result = await notionApiRequest("/comments", "POST", accessToken, payload)

    return {
      success: true,
      output: {
        comment_id: result.id,
        created_time: result.created_time,
        parent: result.parent
      }
    }
  } catch (error: any) {
    logger.error("Notion create comment error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create Notion comment"
    }
  }
}

/**
 * Retrieve comments
 */
export async function notionRetrieveComments(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const blockId = context.dataFlowManager.resolveVariable(config.block_id)
    const pageSize = parseInt(config.page_size) || 100
    
    const params = new URLSearchParams({ 
      block_id: blockId,
      page_size: pageSize.toString() 
    })
    
    const result = await notionApiRequest(`/comments?${params}`, "GET", accessToken)

    return {
      success: true,
      output: {
        comments: result.results,
        has_more: result.has_more,
        next_cursor: result.next_cursor
      }
    }
  } catch (error: any) {
    logger.error("Notion retrieve comments error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to retrieve Notion comments"
    }
  }
}

/**
 * Search workspace
 */
export async function notionSearch(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const query = context.dataFlowManager.resolveVariable(config.query) || ""
    const filterType = context.dataFlowManager.resolveVariable(config.filter_type) || "all"
    const sortDirection = context.dataFlowManager.resolveVariable(config.sort_direction) || "descending"
    const sortTimestamp = context.dataFlowManager.resolveVariable(config.sort_timestamp) || "last_edited_time"
    const pageSize = parseInt(config.page_size) || 100
    
    const payload: any = {
      query,
      page_size: pageSize,
      sort: {
        direction: sortDirection,
        timestamp: sortTimestamp
      }
    }

    if (filterType !== "all") {
      payload.filter = {
        property: "object",
        value: filterType
      }
    }

    const result = await notionApiRequest("/search", "POST", accessToken, payload)

    return {
      success: true,
      output: {
        results: result.results,
        has_more: result.has_more,
        next_cursor: result.next_cursor,
        object: result.object
      }
    }
  } catch (error: any) {
    logger.error("Notion search error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to search Notion workspace"
    }
  }
}

/**
 * Duplicate a page
 */
export async function notionDuplicatePage(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const sourcePageId = context.dataFlowManager.resolveVariable(config.source_page_id)
    const destinationType = context.dataFlowManager.resolveVariable(config.destination_type)
    const destinationDatabaseId = context.dataFlowManager.resolveVariable(config.destination_database_id)
    const destinationPageId = context.dataFlowManager.resolveVariable(config.destination_page_id)
    const titleSuffix = context.dataFlowManager.resolveVariable(config.title_suffix) || " (Copy)"
    const includeContent = config.include_content !== false
    const includeChildren = config.include_children === true

    // First, retrieve the source page
    const sourcePage = await notionApiRequest(`/pages/${sourcePageId}`, "GET", accessToken)
    
    // Extract title from properties
    let originalTitle = ""
    const titleProp = Object.values(sourcePage.properties).find((prop: any) => prop.type === "title") as any
    if (titleProp?.title?.[0]?.text?.content) {
      originalTitle = titleProp.title[0].text.content
    }

    // Create new page with copied properties
    const newPagePayload: any = {
      properties: { ...sourcePage.properties }
    }

    // Update title with suffix
    if (titleProp) {
      const titleKey = Object.keys(sourcePage.properties).find(key => 
        sourcePage.properties[key].type === "title"
      )
      if (titleKey) {
        newPagePayload.properties[titleKey] = {
          title: [{ type: "text", text: { content: originalTitle + titleSuffix } }]
        }
      }
    }

    // Set parent based on destination type
    if (destinationType === "same_parent") {
      newPagePayload.parent = sourcePage.parent
    } else if (destinationType === "database" && destinationDatabaseId) {
      newPagePayload.parent = { database_id: destinationDatabaseId }
    } else if (destinationType === "page" && destinationPageId) {
      newPagePayload.parent = { page_id: destinationPageId }
    }

    // Copy icon and cover
    if (sourcePage.icon) {
      newPagePayload.icon = sourcePage.icon
    }
    if (sourcePage.cover) {
      newPagePayload.cover = sourcePage.cover
    }

    // Copy content blocks if requested
    if (includeContent) {
      const blocksResponse = await notionApiRequest(`/blocks/${sourcePageId}/children`, "GET", accessToken)
      if (blocksResponse.results?.length > 0) {
        newPagePayload.children = blocksResponse.results
      }
    }

    // Create the new page
    const newPage = await notionApiRequest("/pages", "POST", accessToken, newPagePayload)

    // TODO: If includeChildren is true, recursively duplicate child pages

    return {
      success: true,
      output: {
        new_page_id: newPage.id,
        url: newPage.url,
        title: originalTitle + titleSuffix
      }
    }
  } catch (error: any) {
    logger.error("Notion duplicate page error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to duplicate Notion page"
    }
  }
}

/**
 * Sync database entries
 */
export async function notionSyncDatabaseEntries(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")
    
    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const lastSyncTime = context.dataFlowManager.resolveVariable(config.last_sync_time)
    const filterChanged = config.filter_changed !== false
    
    const payload: any = {
      page_size: 100
    }

    // If filtering by changes, add timestamp filter
    if (filterChanged && lastSyncTime) {
      payload.filter = {
        timestamp: "last_edited_time",
        last_edited_time: {
          after: lastSyncTime
        }
      }
    }

    const result = await notionApiRequest(`/databases/${databaseId}/query`, "POST", accessToken, payload)
    
    // Categorize results
    const added: any[] = []
    const modified: any[] = []
    
    if (lastSyncTime) {
      const syncDate = new Date(lastSyncTime)
      result.results.forEach((entry: any) => {
        const createdDate = new Date(entry.created_time)
        if (createdDate > syncDate) {
          added.push(entry)
        } else {
          modified.push(entry)
        }
      })
    } else {
      // If no last sync time, all are considered added
      added.push(...result.results)
    }

    return {
      success: true,
      output: {
        added,
        modified,
        deleted: [], // Notion API doesn't provide deleted items directly
        sync_timestamp: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error("Notion sync database entries error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to sync Notion database entries"
    }
  }
}

/**
 * Find or Create Database Item (Upsert pattern)
 * Searches for an item in a database by a property value
 * If found, returns the existing item
 * If not found and createIfNotFound is true, creates a new item
 */
export async function notionFindOrCreateDatabaseItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    // Resolve variables
    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const searchProperty = context.dataFlowManager.resolveVariable(config.search_property)
    const searchValue = context.dataFlowManager.resolveVariable(config.search_value)
    const createIfNotFound = context.dataFlowManager.resolveVariable(config.create_if_not_found) !== 'false'
    const createProperties = context.dataFlowManager.resolveVariable(config.create_properties) || {}

    logger.debug("[Notion Find or Create] Starting search", {
      databaseId,
      searchProperty,
      searchValue,
      createIfNotFound
    })

    // Step 1: Search for existing item using database query
    // Build filter based on property type
    const filter: any = {
      property: searchProperty,
    }

    // Detect property type and build appropriate filter
    // For simplicity, we'll try text/rich_text first, then other types
    // In production, you'd want to fetch the property type from the database schema
    filter.rich_text = { equals: searchValue }

    const searchPayload = {
      filter,
      page_size: 1 // We only need to know if one exists
    }

    logger.debug("[Notion Find or Create] Searching database", { searchPayload })

    const searchResult = await notionApiRequest(
      `/databases/${databaseId}/query`,
      "POST",
      accessToken,
      searchPayload
    )

    // Step 2: If found, return existing item
    if (searchResult.results && searchResult.results.length > 0) {
      const existingItem = searchResult.results[0]
      logger.debug("[Notion Find or Create] Found existing item", { id: existingItem.id })

      return {
        success: true,
        output: {
          found: true,
          created: false,
          page_id: existingItem.id,
          url: existingItem.url,
          properties: existingItem.properties,
          item: existingItem
        },
        message: "Found existing item"
      }
    }

    // Step 3: If not found and createIfNotFound is false, return not found
    if (!createIfNotFound) {
      logger.debug("[Notion Find or Create] Item not found, create disabled")
      return {
        success: true,
        output: {
          found: false,
          created: false,
          page_id: null,
          properties: null
        },
        message: "Item not found and creation is disabled"
      }
    }

    // Step 4: Create new item
    logger.debug("[Notion Find or Create] Creating new item")

    // Merge search property/value into create properties
    const finalProperties = {
      ...createProperties,
      [searchProperty]: {
        rich_text: [{ type: "text", text: { content: searchValue } }]
      }
    }

    const createPayload = {
      parent: { database_id: databaseId },
      properties: finalProperties
    }

    const newItem = await notionApiRequest("/pages", "POST", accessToken, createPayload)

    logger.debug("[Notion Find or Create] Created new item", { id: newItem.id })

    return {
      success: true,
      output: {
        found: false,
        created: true,
        page_id: newItem.id,
        url: newItem.url,
        properties: newItem.properties,
        item: newItem
      },
      message: "Created new item"
    }

  } catch (error: any) {
    logger.error("[Notion Find or Create] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to find or create database item"
    }
  }
}

/**
 * Archive a database item
 * Sets the archived property to true on a page
 */
export async function notionArchiveDatabaseItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get access token
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    // Resolve variables
    const itemId = context.dataFlowManager.resolveVariable(config.item_id)

    if (!itemId) {
      return {
        success: false,
        output: {},
        message: "Item ID is required to archive a database item"
      }
    }

    logger.info("[Notion Archive Item] Archiving database item:", { itemId })

    // Archive the page by setting archived to true
    const payload = {
      archived: true
    }

    const result = await notionApiRequest(
      `/pages/${itemId}`,
      "PATCH",
      accessToken,
      payload
    )

    logger.info("[Notion Archive Item] Item archived successfully:", { itemId })

    return {
      success: true,
      output: {
        page_id: result.id,
        url: result.url,
        archived: result.archived,
        archived_time: new Date().toISOString(),
        properties: result.properties,
        item: result
      },
      message: "Database item archived successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Archive Item] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to archive database item"
    }
  }
}

/**
 * Restore an archived database item
 * Sets the archived property to false on a page
 */
export async function notionRestoreDatabaseItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get access token
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    // Resolve variables
    const itemId = context.dataFlowManager.resolveVariable(config.item_id)

    if (!itemId) {
      return {
        success: false,
        output: {},
        message: "Item ID is required to restore a database item"
      }
    }

    logger.info("[Notion Restore Item] Restoring database item:", { itemId })

    // Restore the page by setting archived to false
    const payload = {
      archived: false
    }

    const result = await notionApiRequest(
      `/pages/${itemId}`,
      "PATCH",
      accessToken,
      payload
    )

    logger.info("[Notion Restore Item] Item restored successfully:", { itemId })

    return {
      success: true,
      output: {
        page_id: result.id,
        url: result.url,
        archived: result.archived,
        restored_time: new Date().toISOString(),
        properties: result.properties,
        item: result
      },
      message: "Database item restored successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Restore Item] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to restore database item"
    }
  }
}

/**
 * Add a block to a page
 */
export async function notionAddBlock(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import("@/lib/integrations/getDecryptedAccessToken")
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const blockType = context.dataFlowManager.resolveVariable(config.block_type)
    const content = context.dataFlowManager.resolveVariable(config.content)

    if (!pageId) {
      return {
        success: false,
        output: {},
        message: "Page ID is required"
      }
    }

    logger.info("[Notion Add Block] Adding block to page:", { pageId, blockType })

    // Build block object based on type
    let blockObject: any = {
      type: blockType
    }

    // Add content for text-based blocks
    if (content && ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "quote", "callout"].includes(blockType)) {
      blockObject[blockType] = {
        rich_text: [
          {
            type: "text",
            text: { content: content }
          }
        ]
      }

      // Add checked property for to-do blocks
      if (blockType === "to_do") {
        blockObject[blockType].checked = config.checked === true
      }
    } else if (blockType === "code" && content) {
      // Code blocks need language
      blockObject.code = {
        rich_text: [
          {
            type: "text",
            text: { content: content }
          }
        ],
        language: config.language || "plain text"
      }
    } else if (blockType === "divider") {
      // Divider blocks have no content
      blockObject.divider = {}
    }

    const payload = {
      children: [blockObject]
    }

    const result = await notionApiRequest(
      `/blocks/${pageId}/children`,
      "PATCH",
      accessToken,
      payload
    )

    logger.info("[Notion Add Block] Block added successfully")

    const addedBlock = result.results?.[0] || result

    return {
      success: true,
      output: {
        block_id: addedBlock.id,
        type: addedBlock.type,
        content: addedBlock[addedBlock.type] || {},
        block: addedBlock
      },
      message: "Block added successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Add Block] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to add block"
    }
  }
}

/**
 * Get a specific block by ID
 */
export async function notionGetBlock(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const blockId = context.dataFlowManager.resolveVariable(config.block_id)

    if (!blockId) {
      return {
        success: false,
        output: {},
        message: "Block ID is required"
      }
    }

    logger.info("[Notion Get Block] Retrieving block:", { blockId })

    const result = await notionApiRequest(
      `/blocks/${blockId}`,
      "GET",
      accessToken
    )

    logger.info("[Notion Get Block] Block retrieved successfully")

    return {
      success: true,
      output: {
        block_id: result.id,
        type: result.type,
        content: result[result.type] || {},
        has_children: result.has_children,
        block: result
      },
      message: "Block retrieved successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Get Block] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to get block"
    }
  }
}

/**
 * Get children of a block
 */
export async function notionGetBlockChildren(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const blockId = context.dataFlowManager.resolveVariable(config.block_id)
    const pageSize = context.dataFlowManager.resolveVariable(config.page_size) || 100

    if (!blockId) {
      return {
        success: false,
        output: {},
        message: "Block ID is required"
      }
    }

    logger.info("[Notion Get Block Children] Retrieving children:", { blockId, pageSize })

    const result = await notionApiRequest(
      `/blocks/${blockId}/children?page_size=${pageSize}`,
      "GET",
      accessToken
    )

    logger.info("[Notion Get Block Children] Children retrieved successfully")

    return {
      success: true,
      output: {
        children: result.results || [],
        has_more: result.has_more || false,
        next_cursor: result.next_cursor || null,
        count: result.results?.length || 0
      },
      message: "Block children retrieved successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Get Block Children] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to get block children"
    }
  }
}

/**
 * Get page with all children (recursive)
 */
export async function notionGetPageWithChildren(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const depth = context.dataFlowManager.resolveVariable(config.depth) || '1'

    if (!pageId) {
      return {
        success: false,
        output: {},
        message: "Page ID is required"
      }
    }

    logger.info("[Notion Get Page with Children] Retrieving page:", { pageId, depth })

    // Get the page first
    const page = await notionApiRequest(
      `/pages/${pageId}`,
      "GET",
      accessToken
    )

    // Get children blocks
    const childrenResult = await notionApiRequest(
      `/blocks/${pageId}/children?page_size=100`,
      "GET",
      accessToken
    )

    let children = childrenResult.results || []

    // If depth is 'all', recursively get nested children
    if (depth === 'all') {
      const getNestedChildren = async (blocks: any[]): Promise<any[]> => {
        const blocksWithChildren = await Promise.all(
          blocks.map(async (block) => {
            if (block.has_children) {
              const nestedResult = await notionApiRequest(
                `/blocks/${block.id}/children?page_size=100`,
                "GET",
                accessToken
              )
              const nestedChildren = await getNestedChildren(nestedResult.results || [])
              return { ...block, children: nestedChildren }
            }
            return block
          })
        )
        return blocksWithChildren
      }

      children = await getNestedChildren(children)
    }

    logger.info("[Notion Get Page with Children] Page retrieved successfully")

    return {
      success: true,
      output: {
        page_id: page.id,
        url: page.url,
        properties: page.properties,
        children: children,
        child_count: children.length,
        page: page
      },
      message: "Page with children retrieved successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Get Page with Children] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to get page with children"
    }
  }
}

/**
 * Advanced database query with JSON filters
 */
export async function notionAdvancedDatabaseQuery(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const filter = context.dataFlowManager.resolveVariable(config.filter)
    const sorts = context.dataFlowManager.resolveVariable(config.sorts)
    const pageSize = context.dataFlowManager.resolveVariable(config.page_size) || 100

    if (!databaseId) {
      return {
        success: false,
        output: {},
        message: "Database ID is required"
      }
    }

    logger.info("[Notion Advanced Query] Querying database:", { databaseId, hasFilter: !!filter, hasSorts: !!sorts })

    // Build query payload
    const payload: any = {
      page_size: pageSize
    }

    if (filter) {
      payload.filter = filter
    }

    if (sorts) {
      payload.sorts = sorts
    }

    const result = await notionApiRequest(
      `/databases/${databaseId}/query`,
      "POST",
      accessToken,
      payload
    )

    logger.info("[Notion Advanced Query] Query completed successfully")

    return {
      success: true,
      output: {
        results: result.results || [],
        has_more: result.has_more || false,
        next_cursor: result.next_cursor || null,
        result_count: result.results?.length || 0
      },
      message: "Database query completed successfully"
    }
  } catch (error: any) {
    logger.error("[Notion Advanced Query] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to query database"
    }
  }
}

/**
 * Get a specific property from a Notion page
 * GET /pages/{page_id}/properties/{property_id}
 */
export async function notionGetPageProperty(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const pageId = context.dataFlowManager.resolveVariable(config.page_id)
    const propertyName = context.dataFlowManager.resolveVariable(config.property_name)

    if (!pageId || !propertyName) {
      return {
        success: false,
        output: {},
        message: "Page ID and property name are required"
      }
    }

    logger.info("[Notion Get Page Property] Retrieving property:", { pageId, propertyName })

    // First, get the page to find the property ID
    const page = await notionApiRequest(
      `/pages/${pageId}`,
      "GET",
      accessToken
    )

    if (!page.properties) {
      return {
        success: false,
        output: {},
        message: "Page has no properties"
      }
    }

    // Find the property by name
    const property = page.properties[propertyName]
    if (!property) {
      return {
        success: false,
        output: {},
        message: `Property "${propertyName}" not found on page`
      }
    }

    const propertyId = property.id
    const propertyType = property.type

    // Get the property value
    const propertyValue = await notionApiRequest(
      `/pages/${pageId}/properties/${propertyId}`,
      "GET",
      accessToken
    )

    // Format the value based on type
    let formattedValue = ""
    let rawValue: any = null

    switch (propertyType) {
      case "title":
      case "rich_text":
        rawValue = propertyValue.results?.[0]?.title?.plain_text || propertyValue.results?.[0]?.rich_text?.plain_text || ""
        formattedValue = rawValue
        break
      case "number":
        rawValue = propertyValue.number
        formattedValue = rawValue?.toString() || ""
        break
      case "select":
        rawValue = propertyValue.select
        formattedValue = propertyValue.select?.name || ""
        break
      case "multi_select":
        rawValue = propertyValue.multi_select
        formattedValue = propertyValue.multi_select?.map((s: any) => s.name).join(", ") || ""
        break
      case "date":
        rawValue = propertyValue.date
        formattedValue = propertyValue.date?.start || ""
        break
      case "checkbox":
        rawValue = propertyValue.checkbox
        formattedValue = propertyValue.checkbox ? "true" : "false"
        break
      case "url":
        rawValue = propertyValue.url
        formattedValue = propertyValue.url || ""
        break
      case "email":
        rawValue = propertyValue.email
        formattedValue = propertyValue.email || ""
        break
      case "phone_number":
        rawValue = propertyValue.phone_number
        formattedValue = propertyValue.phone_number || ""
        break
      case "people":
        rawValue = propertyValue.people
        formattedValue = propertyValue.people?.map((p: any) => p.name).join(", ") || ""
        break
      case "files":
        rawValue = propertyValue.files
        formattedValue = propertyValue.files?.map((f: any) => f.name).join(", ") || ""
        break
      default:
        rawValue = propertyValue
        formattedValue = JSON.stringify(propertyValue)
    }

    logger.info("[Notion Get Page Property] Property retrieved successfully")

    return {
      success: true,
      output: {
        property_id: propertyId,
        property_type: propertyType,
        value: rawValue,
        formatted_value: formattedValue,
        raw_property: propertyValue
      },
      message: `Retrieved property "${propertyName}" from page`
    }
  } catch (error: any) {
    logger.error("[Notion Get Page Property] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to get page property"
    }
  }
}

/**
 * Add a property to a Notion database
 * PATCH /databases/{database_id}
 */
export async function notionAddDatabaseProperty(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const propertyName = context.dataFlowManager.resolveVariable(config.property_name)
    const propertyType = context.dataFlowManager.resolveVariable(config.property_type)
    const selectOptions = context.dataFlowManager.resolveVariable(config.select_options)

    if (!databaseId || !propertyName || !propertyType) {
      return {
        success: false,
        output: {},
        message: "Database ID, property name, and property type are required"
      }
    }

    logger.info("[Notion Add Database Property] Adding property:", { databaseId, propertyName, propertyType })

    // Build property definition based on type
    let propertyDefinition: any = {}

    switch (propertyType) {
      case "title":
        propertyDefinition = { title: {} }
        break
      case "rich_text":
        propertyDefinition = { rich_text: {} }
        break
      case "number":
        propertyDefinition = { number: { format: "number" } }
        break
      case "select":
        propertyDefinition = {
          select: {
            options: selectOptions || []
          }
        }
        break
      case "multi_select":
        propertyDefinition = {
          multi_select: {
            options: selectOptions || []
          }
        }
        break
      case "date":
        propertyDefinition = { date: {} }
        break
      case "people":
        propertyDefinition = { people: {} }
        break
      case "files":
        propertyDefinition = { files: {} }
        break
      case "checkbox":
        propertyDefinition = { checkbox: {} }
        break
      case "url":
        propertyDefinition = { url: {} }
        break
      case "email":
        propertyDefinition = { email: {} }
        break
      case "phone_number":
        propertyDefinition = { phone_number: {} }
        break
      case "created_time":
        propertyDefinition = { created_time: {} }
        break
      case "created_by":
        propertyDefinition = { created_by: {} }
        break
      case "last_edited_time":
        propertyDefinition = { last_edited_time: {} }
        break
      case "last_edited_by":
        propertyDefinition = { last_edited_by: {} }
        break
      default:
        return {
          success: false,
          output: {},
          message: `Unsupported property type: ${propertyType}`
        }
    }

    const payload = {
      properties: {
        [propertyName]: propertyDefinition
      }
    }

    const result = await notionApiRequest(
      `/databases/${databaseId}`,
      "PATCH",
      accessToken,
      payload
    )

    logger.info("[Notion Add Database Property] Property added successfully")

    return {
      success: true,
      output: {
        database_id: result.id,
        url: result.url,
        title: result.title?.[0]?.plain_text || "",
        properties: result.properties,
        updated_property: propertyName
      },
      message: `Added property "${propertyName}" to database`
    }
  } catch (error: any) {
    logger.error("[Notion Add Database Property] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to add database property"
    }
  }
}

/**
 * Remove a property from a Notion database
 * PATCH /databases/{database_id}
 */
export async function notionRemoveDatabaseProperty(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { getDecryptedAccessToken } = await import('@/lib/integrations/getDecryptedAccessToken')
    const accessToken = await getDecryptedAccessToken(context.userId, "notion")

    if (!accessToken) {
      return {
        success: false,
        output: {},
        message: "Notion integration not connected. Please connect your Notion account."
      }
    }

    const databaseId = context.dataFlowManager.resolveVariable(config.database_id)
    const propertyName = context.dataFlowManager.resolveVariable(config.property_name)

    if (!databaseId || !propertyName) {
      return {
        success: false,
        output: {},
        message: "Database ID and property name are required"
      }
    }

    logger.info("[Notion Remove Database Property] Removing property:", { databaseId, propertyName })

    // To remove a property, set it to null
    const payload = {
      properties: {
        [propertyName]: null
      }
    }

    const result = await notionApiRequest(
      `/databases/${databaseId}`,
      "PATCH",
      accessToken,
      payload
    )

    logger.info("[Notion Remove Database Property] Property removed successfully")

    return {
      success: true,
      output: {
        database_id: result.id,
        url: result.url,
        title: result.title?.[0]?.plain_text || "",
        properties: result.properties,
        updated_property: propertyName
      },
      message: `Removed property "${propertyName}" from database`
    }
  } catch (error: any) {
    logger.error("[Notion Remove Database Property] Error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to remove database property"
    }
  }
}
