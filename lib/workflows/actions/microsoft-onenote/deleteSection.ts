import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteDeleteSection(
  params: {
    sectionId: string
    confirmDelete: boolean
  },
  context: ExecutionContext
) {
  const { sectionId, confirmDelete } = params

  if (!confirmDelete) {
    return {
      success: false,
      error: "Deletion not confirmed. Please confirm you want to delete this section and all its pages."
    }
  }

  if (context.testMode) {
    logger.debug("[TEST MODE] Would delete OneNote section:", { sectionId })
    return {
      success: true,
      data: {
        success: true,
        deletedSectionId: sectionId,
        deletedAt: new Date().toISOString()
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)

    // Delete the section
    await makeGraphRequest(
      `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}`,
      accessToken,
      { method: 'DELETE' }
    )

    return {
      success: true,
      data: {
        success: true,
        deletedSectionId: sectionId,
        deletedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error("Error deleting OneNote section:", error)
    return {
      success: false,
      error: error.message || "Failed to delete OneNote section"
    }
  }
}
