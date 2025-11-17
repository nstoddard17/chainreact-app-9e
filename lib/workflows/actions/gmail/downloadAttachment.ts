import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Downloads an attachment from a Gmail message
 * Returns the attachment data as base64 encoded string
 */
export async function downloadGmailAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message and attachment details from config
    const messageId = resolveValue(config.messageId, input)
    const attachmentId = resolveValue(config.attachmentId, input)

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Message ID is required to download attachment',
      }
    }

    if (!attachmentId || !attachmentId.trim()) {
      return {
        success: false,
        message: 'Attachment ID is required to download attachment',
      }
    }

    logger.debug(`[Gmail Download Attachment] Downloading attachment ${attachmentId} from message ${messageId}`)

    // Download attachment
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to download attachment: ${response.status}`)
    }

    const result = await response.json()

    // Get attachment metadata from message if available in input
    const filename = input.filename || 'attachment'
    const mimeType = input.mimeType || 'application/octet-stream'
    const size = result.size || 0

    logger.debug(`[Gmail Download Attachment] Successfully downloaded attachment: ${filename} (${size} bytes)`)

    return {
      success: true,
      output: {
        ...input,
        messageId,
        attachmentId,
        filename,
        mimeType,
        size,
        data: result.data, // base64url encoded data
        success: true,
        downloadedAt: new Date().toISOString(),
      },
      message: `Attachment "${filename}" downloaded successfully`,
    }
  } catch (error: any) {
    logger.error('[Gmail Download Attachment] Error:', error)
    return {
      success: false,
      message: `Failed to download attachment: ${error.message}`,
      error: error.message,
    }
  }
}
