import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteDeleteNotebook(
  params: {
    notebookId: string
  },
  context: ExecutionContext
) {
  const { notebookId } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would delete OneNote notebook:", { notebookId })
    return {
      success: true,
      output: {
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
      output: {
        success: true,
        deletedNotebookId: notebookId,
        deletedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error("Error deleting OneNote notebook:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to delete OneNote notebook"
    }
  }
}
