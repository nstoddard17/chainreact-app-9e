import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

export async function onenoteDeletePage(
  params: {
    pageId: string
  },
  context: ExecutionContext
) {
  const { pageId } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would delete OneNote page:", { pageId })
    return {
      success: true,
      output: {
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
      output: {
        id: pageId,
        deleted: true,
        deletedDateTime: new Date().toISOString(),
        message: "Page successfully deleted"
      }
    }
  } catch (error: any) {
    logger.error("Error deleting OneNote page:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to delete OneNote page"
    }
  }
}