import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Gets attachment metadata from a Gmail message
 * Note: This returns attachment info but not the actual file data
 * Use downloadAttachment to get the file content
 */
export async function getGmailAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message ID from config
    const messageId = resolveValue(config.messageId, input)

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Message ID is required to get attachments',
      }
    }

    logger.debug(`[Gmail Get Attachment] Fetching attachments for message ${messageId}`)

    // Fetch message with full payload to get attachment info
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to fetch message: ${response.status}`)
    }

    const message = await response.json()

    // Extract attachments from message parts
    const attachments: any[] = []

    const extractAttachments = (parts: any[]) => {
      if (!parts) return

      for (const part of parts) {
        // Check if this part is an attachment
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
          })
        }

        // Recursively check nested parts
        if (part.parts) {
          extractAttachments(part.parts)
        }
      }
    }

    extractAttachments(message.payload?.parts || [])

    logger.debug(`[Gmail Get Attachment] Found ${attachments.length} attachment(s) in message ${messageId}`)

    return {
      success: true,
      output: {
        ...input,
        messageId,
        attachments,
        attachmentCount: attachments.length,
        success: true,
      },
      message: `Found ${attachments.length} attachment(s)`,
    }
  } catch (error: any) {
    logger.error('[Gmail Get Attachment] Error:', error)
    return {
      success: false,
      message: `Failed to get attachments: ${error.message}`,
      error: error.message,
    }
  }
}
