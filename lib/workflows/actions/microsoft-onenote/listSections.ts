import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteListSections(
  params: {
    notebookId: string
    orderBy?: string
  },
  context: ExecutionContext
) {
  const { notebookId, orderBy = "displayName asc" } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would list sections for notebook:", { notebookId })
    return {
      success: true,
      data: {
        sections: [
          {
            id: "test-section-1",
            displayName: "General",
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            isDefault: true
          },
          {
            id: "test-section-2",
            displayName: "Meeting Notes",
            createdDateTime: new Date().toISOString(),
            lastModifiedDateTime: new Date().toISOString(),
            isDefault: false
          }
        ],
        count: 2
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // List sections with ordering
    const response = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}/sections?$orderby=${encodeURIComponent(orderBy)}`,
      accessToken
    )

    const sections = response.value || []

    return {
      success: true,
      data: {
        sections: sections.map((section: any) => ({
          id: section.id,
          displayName: section.displayName,
          createdDateTime: section.createdDateTime,
          lastModifiedDateTime: section.lastModifiedDateTime,
          isDefault: section.isDefault || false
        })),
        count: sections.length
      }
    }
  } catch (error: any) {
    logger.error("Error listing OneNote sections:", error)
    return {
      success: false,
      error: error.message || "Failed to list OneNote sections"
    }
  }
}
