import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteCreateSection(
  params: {
    notebookId: string
    displayName: string
  },
  context: ExecutionContext
) {
  const { notebookId, displayName } = params

  if (context.testMode) {
    console.log("[TEST MODE] Would create OneNote section:", { notebookId, displayName })
    return {
      success: true,
      data: {
        id: "test-section-id",
        displayName,
        createdDateTime: new Date().toISOString()
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Create the section
    const section = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          displayName
        })
      }
    )

    return {
      success: true,
      data: {
        id: section.id,
        displayName: section.displayName,
        createdDateTime: section.createdDateTime,
        lastModifiedDateTime: section.lastModifiedDateTime,
        webUrl: section.webUrl
      }
    }
  } catch (error: any) {
    console.error("Error creating OneNote section:", error)
    return {
      success: false,
      error: error.message || "Failed to create OneNote section"
    }
  }
}