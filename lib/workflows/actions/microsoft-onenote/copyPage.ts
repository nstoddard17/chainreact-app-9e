import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

import { logger } from '@/lib/utils/logger'

export async function onenoteCopyPage(
  params: {
    sourcePageId?: string
    targetNotebookId?: string
    targetSectionId?: string
    destinationSectionId?: string
    pageId?: string
  },
  context: ExecutionContext
) {
  // Accept both targetSectionId and destinationSectionId, and pageId as alias for sourcePageId
  const sourcePageId = params.sourcePageId || params.pageId
  const targetSectionId = params.targetSectionId || params.destinationSectionId
  const targetNotebookId = params.targetNotebookId

  if (!sourcePageId) {
    return {
      success: false,
      output: {},
      error: 'Source page ID is required'
    }
  }

  if (!targetSectionId) {
    return {
      success: false,
      output: {},
      error: 'Target section ID is required (provide targetSectionId or destinationSectionId)'
    }
  }

  if (context.testMode) {
    logger.info("[TEST MODE] Would copy OneNote page:", { sourcePageId, targetSectionId })
    return {
      success: true,
      output: {
        id: "test-copied-page-id",
        operationId: "test-operation-id",
        status: "completed"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Copy the page to the target section
    // Only include id (destination section ID) - omit null siteCollectionId/siteId
    // as sending null values causes "Invalid destination Entity ID" errors
    const copyBody: Record<string, string> = { id: targetSectionId }
    if (targetNotebookId) {
      copyBody.groupId = targetNotebookId
    }

    const copyOperation = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/pages/${sourcePageId}/copyToSection`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(copyBody)
      }
    )

    // The copy operation returns a location header with the operation status URL
    // In production, you might want to poll this URL to check the operation status

    return {
      success: true,
      output: {
        operationId: copyOperation.id || "operation-started",
        operationLocation: copyOperation["@odata.context"] || copyOperation.location,
        status: "initiated",
        message: "Page copy operation started. The page will be available in the target section shortly."
      }
    }
  } catch (error: any) {
    logger.error("Error copying OneNote page:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to copy OneNote page"
    }
  }
}
