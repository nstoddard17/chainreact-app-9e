import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"
import { logger } from '@/lib/utils/logger'

export async function onenoteDeleteSection(
  params: {
    sectionId: string
  },
  context: ExecutionContext
) {
  const { sectionId } = params

  if (context.testMode) {
    logger.debug("[TEST MODE] Would delete OneNote section:", { sectionId })
    return {
      success: true,
      output: {
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
      output: {
        success: true,
        deletedSectionId: sectionId,
        deletedAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error("Error deleting OneNote section:", error)
    return {
      success: false,
      output: {},
      error: error.message || "Failed to delete OneNote section"
    }
  }
}
