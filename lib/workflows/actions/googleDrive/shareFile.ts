import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Share a file or folder in Google Drive
 */
export async function shareGoogleDriveFile(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)

    const {
      fileId,
      shareType = 'user',
      emailAddress,
      role = 'reader',
      sendNotification = true,
      emailMessage
    } = resolvedConfig

    if (!fileId) {
      return {
        success: false,
        output: {},
        message: 'File or folder ID is required'
      }
    }

    if (shareType === 'user' && !emailAddress) {
      return {
        success: false,
        output: {},
        message: 'Email address is required when sharing with a specific person'
      }
    }

    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Build permission request
    const permission: any = {
      role,
      type: shareType
    }

    if (shareType === 'user') {
      permission.emailAddress = emailAddress
    } else if (shareType === 'domain') {
      // Get user's domain
      const aboutResponse = await drive.about.get({ fields: 'user' })
      const userEmail = aboutResponse.data.user?.emailAddress || ''
      const domain = userEmail.split('@')[1]
      if (domain) {
        permission.domain = domain
      }
    }

    // Create the permission
    const permResponse = await drive.permissions.create({
      fileId,
      requestBody: permission,
      sendNotificationEmail: sendNotification,
      emailMessage: emailMessage || undefined,
      transferOwnership: role === 'owner' ? true : undefined,
      fields: 'id, role, type, emailAddress'
    })

    // Get the file's webViewLink for the share link
    const fileResponse = await drive.files.get({
      fileId,
      fields: 'webViewLink, name'
    })

    const sharedWith = shareType === 'user'
      ? emailAddress
      : shareType === 'domain'
        ? 'Organization'
        : 'Anyone with the link'

    logger.info('🔗 [Google Drive] Shared file', {
      fileId,
      fileName: fileResponse.data.name,
      sharedWith,
      role
    })

    return {
      success: true,
      output: {
        permissionId: permResponse.data.id,
        role: permResponse.data.role,
        shareLink: fileResponse.data.webViewLink,
        sharedWith
      },
      message: `Shared with ${sharedWith} as ${role}`
    }
  } catch (error: any) {
    logger.error('❌ [Google Drive] Error sharing file:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Drive authentication failed. Please reconnect your account.')
    }
    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('File not found. It may have been deleted.')
    }
    if (error.message?.includes('403') || error.code === 403) {
      throw new Error('Insufficient permissions to share this file.')
    }

    return {
      success: false,
      output: {},
      message: error.message || 'Failed to share file in Google Drive'
    }
  }
}
