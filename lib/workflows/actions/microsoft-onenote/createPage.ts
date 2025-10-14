import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

export async function onenoteCreatePage(
  params: {
    notebookId?: string
    sectionId?: string
    title: string
    content?: string
    contentType?: string
  },
  context: ExecutionContext
) {
  const { notebookId, sectionId, title, content, contentType = "text/html" } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would create OneNote page:", { notebookId, sectionId, title })
    return {
      success: true,
      data: {
        id: "test-page-id",
        title,
        createdDateTime: new Date().toISOString(),
        webUrl: "https://onenote.com/test-page"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Build the HTML content
    let htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
        </head>
        <body>
          ${content || ""}
        </body>
      </html>
    `

    // If content type is plain text, wrap it in paragraph tags
    if (contentType === "text/plain" && content) {
      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
          </head>
          <body>
            <p>${content.replace(/\n/g, "</p><p>")}</p>
          </body>
        </html>
      `
    }

    // Determine the endpoint based on provided parameters
    let endpoint = "https://graph.microsoft.com/v1.0/me/onenote/pages"
    
    if (sectionId) {
      endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`
    } else if (notebookId) {
      // Get the default section of the notebook if no section specified
      const sections = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections`,
        accessToken
      )
      if (sections.value && sections.value.length > 0) {
        endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sections.value[0].id}/pages`
      }
    }

    // Create the page
    const page = await makeGraphRequest(endpoint, accessToken, {
      method: 'POST',
      headers: {
        'Content-Type': contentType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html"
      },
      body: htmlContent
    })

    return {
      success: true,
      data: {
        id: page.id,
        title: page.title || title,
        createdDateTime: page.createdDateTime,
        lastModifiedDateTime: page.lastModifiedDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl,
        clientUrl: page.links?.oneNoteClientUrl?.href
      }
    }
  } catch (error: any) {
    logger.error("Error creating OneNote page:", error)
    return {
      success: false,
      error: error.message || "Failed to create OneNote page"
    }
  }
}