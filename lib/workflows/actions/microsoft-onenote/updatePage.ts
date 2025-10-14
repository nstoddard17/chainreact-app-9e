import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

export async function onenoteUpdatePage(
  params: {
    pageId: string
    updateMode?: string
    content: string
    target?: string
    position?: string
  },
  context: ExecutionContext
) {
  const { pageId, updateMode = "append", content, target, position = "after" } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would update OneNote page:", { pageId, updateMode, target })
    return {
      success: true,
      data: {
        id: pageId,
        updatedDateTime: new Date().toISOString()
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Build the PATCH request based on update mode
    let patchContent: any[] = []
    
    switch (updateMode) {
      case "append":
        patchContent = [
          {
            target: "body",
            action: "append",
            content: content
          }
        ]
        break
        
      case "prepend":
        patchContent = [
          {
            target: "body",
            action: "prepend",
            content: content
          }
        ]
        break
        
      case "replace":
        patchContent = [
          {
            target: "body",
            action: "replace",
            content: content
          }
        ]
        break
        
      case "insert":
        if (!target) {
          throw new Error("Target element is required for insert mode")
        }
        patchContent = [
          {
            target: target,
            action: position === "inside" ? "append" : position,
            content: content
          }
        ]
        break
        
      default:
        throw new Error(`Invalid update mode: ${updateMode}`)
    }

    // Update the page content
    await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}/content`,
      accessToken,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patchContent)
      }
    )

    // Get updated page info
    const page = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}`,
      accessToken
    )

    return {
      success: true,
      data: {
        id: page.id,
        title: page.title,
        lastModifiedDateTime: page.lastModifiedDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl
      }
    }
  } catch (error: any) {
    logger.error("Error updating OneNote page:", error)
    return {
      success: false,
      error: error.message || "Failed to update OneNote page"
    }
  }
}