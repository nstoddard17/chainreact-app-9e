import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Get detailed metadata for a file or folder in Google Drive
 */
export async function getGoogleDriveFileMetadata(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const {
      fileId,
      includePermissions = true,
      includeOwner = true
    } = resolvedConfig

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

    // Build fields list based on config
    const fieldParts = [
      'id', 'name', 'mimeType', 'size',
      'createdTime', 'modifiedTime',
      'webViewLink', 'webContentLink',
      'shared', 'starred', 'trashed',
      'description', 'parents'
    ]
    if (includeOwner) fieldParts.push('owners')
    if (includePermissions) fieldParts.push('permissions(id,role,type,emailAddress,displayName)')

    const response = await drive.files.get({
      fileId,
      fields: fieldParts.join(', ')
    })

    const file = response.data

    logger.info('ℹ️ [Google Drive] Retrieved file metadata', {
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType
    })

    return {
      success: true,
      output: {
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size, 10) : 0,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        owners: file.owners || [],
        permissions: file.permissions || [],
        shared: file.shared || false,
        starred: file.starred || false,
        trashed: file.trashed || false
      },
      message: `Retrieved metadata for: ${file.name}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error getting file metadata:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('File not found. It may have been deleted.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to access this file.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get file metadata from Google Drive'
    }
  }
}
