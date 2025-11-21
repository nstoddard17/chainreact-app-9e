import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteDeleteNotebook(
  params: {
    notebookId: string
    confirmDelete: boolean
  },
  context: ExecutionContext
) {
  const { notebookId, confirmDelete } = params

  if (!confirmDelete) {
    return {
      success: false,
      error: "Deletion not confirmed. Please confirm you want to delete this notebook and all its contents."
    }
  }

  if (context.testMode) {
    logger.debug("[TEST MODE] Would delete OneNote notebook:", { notebookId })
    return {
      success: true,
      data: {
        success: true,
        deletedNotebookId: notebookId,
        deletedAt: new Date().toISOString()
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Delete the notebook
    await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}`,
      accessToken,
      { method: 'DELETE' }
    )

    return {
      success: true,
      data: {
        success: true,
        deletedNotebookId: notebookId,
        deletedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error("Error deleting OneNote notebook:", error)
    return {
      success: false,
      error: error.message || "Failed to delete OneNote notebook"
    }
  }
}
