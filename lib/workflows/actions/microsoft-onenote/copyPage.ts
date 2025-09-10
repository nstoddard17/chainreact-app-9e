import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteCopyPage(
  params: {
    sourcePageId: string
    targetNotebookId: string
    targetSectionId: string
  },
  context: ExecutionContext
) {
  const { sourcePageId, targetNotebookId, targetSectionId } = params

  if (context.testMode) {
    console.log("[TEST MODE] Would copy OneNote page:", { sourcePageId, targetSectionId })
    return {
      success: true,
      data: {
        id: "test-copied-page-id",
        operationId: "test-operation-id",
        status: "completed"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Copy the page to the target section
    const copyOperation = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${sourcePageId}/copyToSection`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          id: targetSectionId,
          siteCollectionId: null,
          siteId: null
        })
      }
    )

    // The copy operation returns a location header with the operation status URL
    // In production, you might want to poll this URL to check the operation status
    
    return {
      success: true,
      data: {
        operationId: copyOperation.id || "operation-started",
        operationLocation: copyOperation["@odata.context"] || copyOperation.location,
        status: "initiated",
        message: "Page copy operation started. The page will be available in the target section shortly."
      }
    }
  } catch (error: any) {
    console.error("Error copying OneNote page:", error)
    return {
      success: false,
      error: error.message || "Failed to copy OneNote page"
    }
  }
}