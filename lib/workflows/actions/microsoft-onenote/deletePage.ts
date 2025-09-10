import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteDeletePage(
  params: {
    pageId: string
    confirmDelete: boolean
  },
  context: ExecutionContext
) {
  const { pageId, confirmDelete } = params

  if (!confirmDelete) {
    return {
      success: false,
      error: "Deletion not confirmed. Please confirm you want to delete this page."
    }
  }

  if (context.testMode) {
    console.log("[TEST MODE] Would delete OneNote page:", { pageId })
    return {
      success: true,
      data: {
        id: pageId,
        deleted: true,
        deletedDateTime: new Date().toISOString()
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Delete the page
    await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${pageId}`,
      accessToken,
      { method: 'DELETE' }
    )

    return {
      success: true,
      data: {
        id: pageId,
        deleted: true,
        deletedDateTime: new Date().toISOString(),
        message: "Page successfully deleted"
      }
    }
  } catch (error: any) {
    console.error("Error deleting OneNote page:", error)
    return {
      success: false,
      error: error.message || "Failed to delete OneNote page"
    }
  }
}