import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

export async function onenoteGetPageContent(
  params: {
    pageId: string
    includeIDs?: boolean
    preGenerated?: boolean
  },
  context: ExecutionContext
) {
  const { pageId, includeIDs = false, preGenerated = true } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would get OneNote page content:", { pageId, includeIDs })
    return {
      success: true,
      data: {
        id: pageId,
        content: "<html><body><p>Test page content</p></body></html>",
        title: "Test Page"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Construct the endpoint with query parameters
    let contentEndpoint = `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}/content`
    const queryParams = []
    
    if (includeIDs) {
      queryParams.push("includeIDs=true")
    }
    
    if (preGenerated) {
      queryParams.push("preGenerated=true")
    }
    
    if (queryParams.length > 0) {
      contentEndpoint += `?${queryParams.join("&")}`
    }

    // Get the page content (returns HTML)
    const contentResponse = await fetch(contentEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'text/html'
      }
    })
    
    if (!contentResponse.ok) {
      throw new Error(`Failed to get page content: ${contentResponse.status}`)
    }
    
    const content = await contentResponse.text()

    // Also get page metadata
    const page = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}`,
      accessToken
    )

    return {
      success: true,
      data: {
        id: page.id,
        title: page.title,
        content: content,
        createdDateTime: page.createdDateTime,
        lastModifiedDateTime: page.lastModifiedDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl
      }
    }
  } catch (error: any) {
    logger.error("Error getting OneNote page content:", error)
    return {
      success: false,
      error: error.message || "Failed to get OneNote page content"
    }
  }
}