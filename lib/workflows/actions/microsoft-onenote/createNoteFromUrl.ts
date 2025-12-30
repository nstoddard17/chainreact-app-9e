import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteCreateNoteFromUrl(
  params: {
    notebookId?: string
    sectionId?: string
    sourceUrl: string
    title?: string
  },
  context: ExecutionContext
) {
  const { notebookId, sectionId, sourceUrl, title } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would create OneNote page from URL:", { sourceUrl, title })
    return {
      success: true,
      output: {
        id: "test-page-id",
        title: title || "Page from URL",
        sourceUrl,
        createdDateTime: new Date().toISOString(),
        webUrl: "https://onenote.com/test-page",
        contentUrl: "https://onenote.com/test-page/content"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Fetch content from URL
    let pageTitle = title
    let pageContent = ""

    try {
      const urlResponse = await fetch(sourceUrl)
      const htmlContent = await urlResponse.text()

      // Extract title if not provided
      if (!pageTitle) {
        const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i)
        pageTitle = titleMatch ? titleMatch[1] : "Page from " + new URL(sourceUrl).hostname
      }

      // Simple content extraction (remove scripts and styles)
      pageContent = htmlContent
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
    } catch (fetchError: any) {
      logger.error("Error fetching URL content:", fetchError)
      pageTitle = title || "Page from " + sourceUrl
      pageContent = `<p>Source: <a href="${sourceUrl}">${sourceUrl}</a></p>`
    }

    // Build the HTML content with source citation
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${pageTitle}</title>
        </head>
        <body>
          <p><strong>Source:</strong> <a href="${sourceUrl}">${sourceUrl}</a></p>
          <hr/>
          ${pageContent}
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
      output: {
        id: page.id,
        title: page.title || pageTitle,
        sourceUrl,
        createdDateTime: page.createdDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl,
        contentUrl: page.contentUrl
      }
    }
  } catch (error: any) {
    logger.error("Error creating OneNote page from URL:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to create OneNote page from URL"
    }
  }
}
