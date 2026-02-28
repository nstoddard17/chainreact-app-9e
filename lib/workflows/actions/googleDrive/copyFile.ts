import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Copy a file in Google Drive
 */
export async function copyGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const { fileId, newName, destinationFolderId } = resolvedConfig

    if (!fileId) {
      return {
        success: false,
        output: {},
        message: 'File ID is required'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const requestBody: any = {}
    if (newName) requestBody.name = newName
    if (destinationFolderId) requestBody.parents = [destinationFolderId]

    const response = await drive.files.copy({
      fileId,
      requestBody,
      fields: 'id, name, webViewLink, mimeType, createdTime'
    })

    const copied = response.data

    logger.info('📋 [Google Drive] Copied file', {
      sourceFileId: fileId,
      newFileId: copied.id,
      newName: copied.name
    })

    return {
      success: true,
      output: {
        fileId: copied.id,
        fileName: copied.name,
        fileUrl: copied.webViewLink,
        mimeType: copied.mimeType,
        createdTime: copied.createdTime
      },
      message: `Copied file as: ${copied.name}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error copying file:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('Source file not found. It may have been deleted.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to copy this file.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to copy file in Google Drive'
    }
  }
}
