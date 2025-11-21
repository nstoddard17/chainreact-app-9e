import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteCreateQuickNote(
  params: {
    title: string
    content?: string
  },
  context: ExecutionContext
) {
  const { title, content } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would create Quick Note:", { title })
    return {
      success: true,
      data: {
        id: "test-quicknote-id",
        title,
        createdDateTime: new Date().toISOString(),
        webUrl: "https://onenote.com/test-quicknote",
        contentUrl: "https://onenote.com/test-quicknote/content"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Build the HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
        </head>
        <body>
          ${content ? `<p>${content.replace(/\n/g, "</p><p>")}</p>` : ""}
        </body>
      </html>
    `

    // Create the page in the default "Quick Notes" section
    // First, get the default notebook
    const notebooks = await makeGraphRequest(
      'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$filter=isDefault eq true',
      accessToken
    )

    if (!notebooks.value || notebooks.value.length === 0) {
      throw new Error("No default notebook found. Please create a notebook first.")
    }

    const defaultNotebook = notebooks.value[0]

    // Get or create "Quick Notes" section
    const sections = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${defaultNotebook.id}/sections`,
      accessToken
    )

    let quickNotesSection = sections.value?.find((s: any) =>
      s.displayName.toLowerCase() === 'quick notes'
    )

    if (!quickNotesSection) {
      // Create Quick Notes section if it doesn't exist
      quickNotesSection = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${defaultNotebook.id}/sections`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ displayName: 'Quick Notes' })
        }
      )
    }

    // Create the page
    const page = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${quickNotesSection.id}/pages`,
      accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html'
        },
        body: htmlContent
      }
    )

    return {
      success: true,
      data: {
        id: page.id,
        title: page.title || title,
        createdDateTime: page.createdDateTime,
        webUrl: page.links?.oneNoteWebUrl?.href || page.webUrl,
        contentUrl: page.contentUrl
      }
    }
  } catch (error: any) {
    logger.error("Error creating Quick Note:", error)
    return {
      success: false,
      error: error.message || "Failed to create Quick Note"
    }
  }
}
