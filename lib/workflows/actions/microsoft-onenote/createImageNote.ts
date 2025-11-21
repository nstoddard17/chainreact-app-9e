import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteCreateImageNote(
  params: {
    notebookId?: string
    sectionId?: string
    title: string
    imageUrl: string
    caption?: string
    additionalContent?: string
  },
  context: ExecutionContext
) {
  const { notebookId, sectionId, title, imageUrl, caption, additionalContent } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would create OneNote page with image:", { title, imageUrl })
    return {
      success: true,
      data: {
        id: "test-image-note-id",
        title,
        imageUrl,
        createdDateTime: new Date().toISOString(),
        webUrl: "https://onenote.com/test-image-note",
        contentUrl: "https://onenote.com/test-image-note/content"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Build the HTML content with embedded image
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
        </head>
        <body>
          <img src="${imageUrl}" alt="${title}" />
          ${caption ? `<p><em>${caption}</em></p>` : ""}
          ${additionalContent ? `<div>${additionalContent}</div>` : ""}
        </body>
      </html>
    `

    // Determine the endpoint
    let endpoint = "https://graph.microsoft.com/v1.0/me/onenote/pages"

    if (sectionId) {
      endpoint = `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`
    } else if (notebookId) {
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
        'Content-Type': 'text/html'
      },
      body: htmlContent
    })

    return {
      success: true,
      data: {
        id: page.id,
        title: page.title || title,
        imageUrl,
        createdDateTime: page.createdDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl,
        contentUrl: page.contentUrl
      }
    }
  } catch (error: any) {
    logger.error("Error creating OneNote page with image:", error)
    return {
      success: false,
      error: error.message || "Failed to create OneNote page with image"
    }
  }
}
