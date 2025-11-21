import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteListNotebooks(
  params: {
    orderBy?: string
  },
  context: ExecutionContext
) {
  const { orderBy = "displayName asc" } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would list OneNote notebooks")
    return {
      success: true,
      data: {
        notebooks: [
          {
            id: "test-notebook-1",
            displayName: "Personal Notebook",
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            isDefault: true,
            isShared: false
          },
          {
            id: "test-notebook-2",
            displayName: "Work Notebook",
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            isDefault: false,
            isShared: true
          }
        ],
        count: 2
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // List notebooks with ordering
    const response = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks?$orderby=${encodeURIComponent(orderBy)}`,
      accessToken
    )

    const notebooks = response.value || []

    return {
      success: true,
      data: {
        notebooks: notebooks.map((nb: any) => ({
          id: nb.id,
          displayName: nb.displayName,
          createdDateTime: nb.createdDateTime,
          lastModifiedDateTime: nb.lastModifiedDateTime,
          isDefault: nb.isDefault || false,
          isShared: nb.isShared || false
        })),
        count: notebooks.length
      }
    }
  } catch (error: any) {
    logger.error("Error listing OneNote notebooks:", error)
    return {
      success: false,
      error: error.message || "Failed to list OneNote notebooks"
    }
  }
}
