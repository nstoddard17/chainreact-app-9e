import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteGetSectionDetails(
  params: {
    sectionId: string
  },
  context: ExecutionContext
) {
  const { sectionId } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would get section details:", { sectionId })
    return {
      success: true,
      data: {
        id: sectionId,
        displayName: "Test Section",
        createdDateTime: new Date().toISOString(),
        lastModifiedDateTime: new Date().toISOString(),
        isDefault: false,
        pagesUrl: "https://graph.microsoft.com/test/pages",
        links: {
          oneNoteClientUrl: { href: "onenote:test" },
          oneNoteWebUrl: { href: "https://onenote.com/test" }
        }
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Get section details
    const section = await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}`,
      accessToken
    )

    return {
      success: true,
      data: {
        id: section.id,
        displayName: section.displayName,
        createdDateTime: section.createdDateTime,
        lastModifiedDateTime: section.lastModifiedDateTime,
        isDefault: section.isDefault || false,
        pagesUrl: section.pagesUrl,
        links: section.links
      }
    }
  } catch (error: any) {
    logger.error("Error getting OneNote section details:", error)
    return {
      success: false,
      error: error.message || "Failed to get OneNote section details"
    }
  }
}
