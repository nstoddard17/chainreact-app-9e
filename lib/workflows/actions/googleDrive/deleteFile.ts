import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Delete or trash a file/folder in Google Drive
 */
export async function deleteGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const { fileId, permanentDelete = false } = resolvedConfig

    if (!fileId) {
      return {
        success: false,
        output: {},
        message: 'File or folder ID is required'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get file info before deletion
    const fileInfo = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType'
    })

    const fileName = fileInfo.data.name || 'Unknown'

    if (permanentDelete) {
      await drive.files.delete({ fileId })
      logger.info('🗑️ [Google Drive] Permanently deleted file', { fileId, fileName })
    } else {
      await drive.files.update({
        fileId,
        requestBody: { trashed: true }
      })
      logger.info('🗑️ [Google Drive] Moved file to trash', { fileId, fileName })
    }

    return {
      success: true,
      output: {
        fileId,
        fileName,
        deletionType: permanentDelete ? 'permanent' : 'trashed',
        success: true,
        deletedAt: new Date().toISOString()
      },
      message: permanentDelete
        ? `Permanently deleted: ${fileName}`
        : `Moved to trash: ${fileName}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error deleting file:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('File not found. It may have already been deleted.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to delete this file.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to delete file from Google Drive'
    }
  }
}
