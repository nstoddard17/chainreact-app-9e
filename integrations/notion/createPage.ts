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
      parent_type, // "database_id" or "page_id"
      parent_id,
      title,
      properties = {},
      content = []
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!parent_type || !parent_id) {
      return {
        success: false,
        error: "Missing required parameters: parent_type and parent_id"
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
      parent: {
        [parent_type]: parent_id
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
        },
        ...properties
      }
    }
    
    // Add content blocks if provided
    if (content && content.length > 0) {
      payload.children = content
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