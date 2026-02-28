import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Create a new folder in Google Drive
 */
export async function createGoogleDriveFolder(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const { folderName, parentFolderId, description, shareWithDomain = false } = resolvedConfig

    if (!folderName) {
      return {
        success: false,
        output: {},
        message: 'Folder name is required'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const fileMetadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    }
    if (description) fileMetadata.description = description
    if (parentFolderId) fileMetadata.parents = [parentFolderId]

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, webViewLink, createdTime'
    })

    const folder = response.data

    // Share with domain if requested
    if (shareWithDomain && folder.id) {
      try {
        // Get user's domain from their profile
        const aboutResponse = await drive.about.get({ fields: 'user' })
        const userEmail = aboutResponse.data.user?.emailAddress || ''
        const domain = userEmail.split('@')[1]

        if (domain) {
          await drive.permissions.create({
            fileId: folder.id,
            requestBody: {
              role: 'reader',
              type: 'domain',
              domain
            }
          })
          logger.info('🔗 [Google Drive] Shared folder with domain', { folderId: folder.id, domain })
        }
      } catch (shareError: any) {
        logger.warn('⚠️ [Google Drive] Could not share folder with domain:', shareError.message)
      }
    }

    logger.info('📁 [Google Drive] Created folder', {
      folderId: folder.id,
      folderName: folder.name
    })

    return {
      success: true,
      output: {
        folderId: folder.id,
        folderName: folder.name,
        folderUrl: folder.webViewLink,
        createdTime: folder.createdTime
      },
      message: `Created folder: ${folder.name}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error creating folder:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to create a folder.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create folder in Google Drive'
    }
  }
}
