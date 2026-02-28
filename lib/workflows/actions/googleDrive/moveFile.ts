import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Move a file or folder to a different location in Google Drive
 */
export async function moveGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const { fileId, destinationFolderId, removeFromAllParents = true } = resolvedConfig

    if (!fileId) {
      return {
        success: false,
        output: {},
        message: 'File or folder ID is required'
      }
    }

    if (!destinationFolderId) {
      return {
        success: false,
        output: {},
        message: 'Destination folder is required'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Get current parents so we can remove them
    const currentFile = await drive.files.get({
      fileId,
      fields: 'id, name, parents'
    })

    const previousParents = removeFromAllParents
      ? (currentFile.data.parents || []).join(',')
      : undefined

    // Move by updating parents
    const response = await drive.files.update({
      fileId,
      addParents: destinationFolderId,
      removeParents: previousParents,
      fields: 'id, name, parents, webViewLink'
    })

    // Get destination folder name for output
    let newLocation = destinationFolderId
    try {
      const destFolder = await drive.files.get({
        fileId: destinationFolderId,
        fields: 'name'
      })
      newLocation = destFolder.data.name || destinationFolderId
    } catch {
      // Keep using the ID if we can't get the name
    }

    logger.info('📂 [Google Drive] Moved file', {
      fileId,
      fileName: response.data.name,
      newLocation
    })

    return {
      success: true,
      output: {
        fileId: response.data.id,
        fileName: response.data.name,
        newLocation,
        success: true
      },
      message: `Moved "${response.data.name}" to ${newLocation}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error moving file:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('File or destination folder not found.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to move this file.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to move file in Google Drive'
    }
  }
}
