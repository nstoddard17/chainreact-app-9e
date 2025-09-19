import { ActionResult } from '../core/executeWait'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

const NOTION_API_VERSION = "2022-06-28"

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
    console.error("Notion create page error:", error)
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
        console.log(`Skipping block content field: ${key}`)
        continue
      }

      // Skip properties that contain '-content' suffix as they're usually block content
      if (key.includes('-content')) {
        console.log(`Skipping content field: ${key}`)
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
          console.log(`Skipping property ${key} - appears to be block content`)
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
    console.log('Processed properties for Notion update:', JSON.stringify(properties, null, 2))

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
      console.log('No fields to update for Notion page')
      return {
        success: true,
        output: {
          page_id: pageId,
          message: 'No changes to apply'
        }
      }
    }

    console.log('Final payload for Notion update:', JSON.stringify(payload, null, 2))

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
    console.error("Notion update page error:", error)
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
    console.error("Notion retrieve page error:", error)
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
    console.error("Notion archive page error:", error)
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
    console.error("Notion create database error:", error)
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
    console.error("Notion query database error:", error)
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
    console.error("Notion update database error:", error)
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

    console.log('📝 notionAppendBlocks - config:', config)
    console.log('📝 notionAppendBlocks - resolved blocks:', blocks)

    // Ensure blocks is an array
    const blocksArray = Array.isArray(blocks) ? blocks : []

    // Don't make API call if there are no blocks to append
    if (blocksArray.length === 0) {
      console.log('📝 notionAppendBlocks - No blocks to append, skipping')
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
    console.error("Notion append blocks error:", error)
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

    console.log('📝 notionUpdateBlock - Updating block:', {
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
    console.error("Notion update block error:", error)
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
    console.error("Notion delete block error:", error)
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
    console.error("Notion retrieve block children error:", error)
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
    console.error("Notion list users error:", error)
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
    console.error("Notion retrieve user error:", error)
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
    console.error("Notion create comment error:", error)
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
    console.error("Notion retrieve comments error:", error)
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
    console.error("Notion search error:", error)
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
    console.error("Notion duplicate page error:", error)
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
    console.error("Notion sync database entries error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to sync Notion database entries"
    }
  }
}