/**
 * Notion Create Page Action Handler
 * 
 * Creates a new page in Notion using the Notion API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "notion_action_create_page",
  name: "Create Notion Page",
  description: "Create a new page in a Notion database or workspace",
  icon: "file-text"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Creates a new Notion page
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createNotionPage(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Notion OAuth token
    const credentials = await getIntegrationCredentials(userId, "notion")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      workspace,
      title,
      icon,
      cover,
      template,
      page_content,
      heading_1,
      heading_2,
      heading_3,
      bullet_list,
      numbered_list,
      quote,
      code_block,
      divider
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!title) {
      return {
        success: false,
        error: "Missing required parameter: title"
      }
    }
    
    if (!title) {
      return {
        success: false,
        error: "Missing required parameter: title"
      }
    }
    
    // 5. Prepare the request payload
    const payload: any = {
      // Create page in the user's workspace (no specific parent)
      parent: {
        type: "workspace_id",
        workspace_id: true // This creates the page in the root of the workspace
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        }
      }
    }
    
    // Add icon if provided
    if (icon) {
      // Handle different icon input types
      if (typeof icon === 'string') {
        if (icon.startsWith('http')) {
          // External URL
          payload.icon = { type: "external", external: { url: icon } }
        } else if (icon.length <= 2) {
          // Emoji
          payload.icon = { type: "emoji", emoji: icon }
        } else {
          // Assume it's a file path or URL
          payload.icon = { type: "external", external: { url: icon } }
        }
      } else if (icon && typeof icon === 'object') {
        if (icon.url) {
          // File object with URL
          payload.icon = { type: "external", external: { url: icon.url } }
        } else if (icon.file) {
          // Upload file to Notion and get URL
          // For now, we'll need to implement file upload to Notion
          // This would require uploading to a file service first
          console.warn("File upload for Notion icons not yet implemented")
        }
      }
    }
    
    // Add cover if provided
    if (cover) {
      // Handle different cover input types
      if (typeof cover === 'string') {
        if (cover.startsWith('http')) {
          // External URL
          payload.cover = { type: "external", external: { url: cover } }
        } else {
          // Assume it's a file path or URL
          payload.cover = { type: "external", external: { url: cover } }
        }
      } else if (cover && typeof cover === 'object') {
        if (cover.url) {
          // File object with URL
          payload.cover = { type: "external", external: { url: cover.url } }
        } else if (cover.file) {
          // Upload file to Notion and get URL
          // For now, we'll need to implement file upload to Notion
          // This would require uploading to a file service first
          console.warn("File upload for Notion covers not yet implemented")
        }
      }
    }
    
    // Build content blocks from separate fields
    const contentBlocks = []
    
    // Add headings if provided
    if (heading_1) {
      contentBlocks.push({
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ type: "text", text: { content: heading_1 } }]
        }
      })
    }
    
    if (heading_2) {
      contentBlocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: heading_2 } }]
        }
      })
    }
    
    if (heading_3) {
      contentBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: heading_3 } }]
        }
      })
    }
    
    // Add main page content if provided
    if (page_content) {
      contentBlocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: page_content } }]
        }
      })
    }
    
    // Add bullet list if provided
    if (bullet_list) {
      const listItems = bullet_list.split('\n').filter((item: string) => item.trim())
      listItems.forEach((item: string) => {
        contentBlocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: item.trim() } }]
          }
        })
      })
    }
    
    // Add numbered list if provided
    if (numbered_list) {
      const listItems = numbered_list.split('\n').filter((item: string) => item.trim())
      listItems.forEach((item: string) => {
        contentBlocks.push({
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content: item.trim() } }]
          }
        })
      })
    }
    
    // Add quote if provided
    if (quote) {
      contentBlocks.push({
        object: "block",
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: quote } }]
        }
      })
    }
    
    // Add code block if provided
    if (code_block) {
      contentBlocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: code_block } }],
          language: "plain text"
        }
      })
    }
    
    // Add divider if requested
    if (divider) {
      contentBlocks.push({
        object: "block",
        type: "divider",
        divider: {}
      })
    }
    
    // Add content blocks to payload if any exist
    if (contentBlocks.length > 0) {
      payload.children = contentBlocks
    }
    
    // 6. Make Notion API request
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Notion API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        pageId: data.id,
        url: data.url,
        createdTime: data.created_time,
        lastEditedTime: data.last_edited_time,
        archived: data.archived,
        properties: data.properties
      },
      message: `Page "${title}" created successfully in Notion`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Notion create page failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create Notion page"
    }
  }
} 