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
    logger.info("[TEST MODE] Would get OneNote page content:", { pageId, includeIDs })
    return {
      success: true,
      output: {
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
    // OneNote content endpoint is eventually consistent - retry on 404
    let contentResponse: Response | null = null
    let content = ''
    const maxRetries = 3

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      contentResponse = await fetch(contentEndpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'text/html'
        }
      })

      if (contentResponse.ok) {
        content = await contentResponse.text()
        break
      }

      // Retry on 404 (eventual consistency) but not on other errors
      if (contentResponse.status === 404 && attempt < maxRetries - 1) {
        logger.info(`[OneNote] Page content not yet available (attempt ${attempt + 1}/${maxRetries}), retrying...`)
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
        continue
      }

      throw new Error(`Failed to get page content: ${contentResponse.status}`)
    }

    // Also get page metadata
    const page = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}`,
      accessToken
    )

    return {
      success: true,
      output: {
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
      output: {},
      error: error.message || "Failed to get OneNote page content"
    }
  }
}