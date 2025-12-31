import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteGetNotebookDetails(
  params: {
    notebookId: string
  },
  context: ExecutionContext
) {
  const { notebookId } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would get notebook details:", { notebookId })
    return {
      success: true,
      output: {
        id: notebookId,
        displayName: "Test Notebook",
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString(),
        isDefault: true,
        isShared: false,
        sectionsUrl: "https://graph.microsoft.com/test/sections",
        sectionGroupsUrl: "https://graph.microsoft.com/test/sectionGroups",
        links: {
          oneNoteClientUrl: { href: "onenote:test" },
          oneNoteWebUrl: { href: "https://onenote.com/test" }
        }
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Get notebook details
    const notebook = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebookId}`,
      accessToken
    )

    return {
      success: true,
      output: {
        id: notebook.id,
        displayName: notebook.displayName,
        createdDateTime: notebook.createdDateTime,
        lastModifiedDateTime: notebook.lastModifiedDateTime,
        isDefault: notebook.isDefault || false,
        isShared: notebook.isShared || false,
        sectionsUrl: notebook.sectionsUrl,
        sectionGroupsUrl: notebook.sectionGroupsUrl,
        links: notebook.links
      }
    }
  } catch (error: any) {
    logger.error("Error getting OneNote notebook details:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to get OneNote notebook details"
    }
  }
}
