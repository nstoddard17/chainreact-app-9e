import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Gets attachment(s) from a Gmail message with optional data download
 * Supports multiple selection modes: all, first, by ID, by filename, or by pattern
 */
export async function getGmailAttachment(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get config values
    const messageId = resolveValue(config.messageId, input)
    const attachmentSelection = resolveValue(config.attachmentSelection, input) || 'all'
    const saveToVariable = resolveValue(config.saveToVariable, input) !== false // Default true

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Message ID is required to get attachments',
      }
    }

    logger.debug(`[Gmail Get Attachment] Fetching attachments for message ${messageId}, mode: ${attachmentSelection}`)

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

    if (attachments.length === 0) {
      return {
        success: false,
        message: 'No attachments found in this email',
      }
    }

    logger.debug(`[Gmail Get Attachment] Found ${attachments.length} attachment(s)`)

    // Filter attachments based on selection mode
    let selectedAttachments = attachments

    if (attachmentSelection === 'first') {
      selectedAttachments = [attachments[0]]
    } else if (attachmentSelection === 'id') {
      const targetId = resolveValue(config.attachmentId, input)
      selectedAttachments = attachments.filter(a => a.attachmentId === targetId)
      if (selectedAttachments.length === 0) {
        return {
          success: false,
          message: `Attachment with ID "${targetId}" not found`,
        }
      }
    } else if (attachmentSelection === 'filename') {
      const targetFilename = resolveValue(config.filename, input)
      selectedAttachments = attachments.filter(a => a.filename === targetFilename)
      if (selectedAttachments.length === 0) {
        return {
          success: false,
          message: `Attachment with filename "${targetFilename}" not found`,
        }
      }
    } else if (attachmentSelection === 'pattern') {
      const pattern = resolveValue(config.filenamePattern, input)
      selectedAttachments = attachments.filter(a =>
        a.filename.toLowerCase().includes(pattern.toLowerCase())
      )
      if (selectedAttachments.length === 0) {
        return {
          success: false,
          message: `No attachments found matching pattern "${pattern}"`,
        }
      }
      // Take only the first match for pattern mode
      selectedAttachments = [selectedAttachments[0]]
    }

    // Download attachment data if requested
    if (saveToVariable) {
      for (const attachment of selectedAttachments) {
        try {
          const dataResponse = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachment.attachmentId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          )

          if (dataResponse.ok) {
            const dataResult = await dataResponse.json()
            attachment.data = dataResult.data // base64url encoded
          }
        } catch (error) {
          logger.error(`[Gmail Get Attachment] Failed to download data for ${attachment.filename}:`, error)
        }
      }
    }

    logger.debug(`[Gmail Get Attachment] Returning ${selectedAttachments.length} attachment(s)`)

    return {
      success: true,
      output: {
        ...input,
        messageId,
        attachments: selectedAttachments,
        attachmentCount: selectedAttachments.length,
        // For single attachment modes, also expose as singular fields
        ...(selectedAttachments.length === 1 ? {
          attachmentId: selectedAttachments[0].attachmentId,
          filename: selectedAttachments[0].filename,
          mimeType: selectedAttachments[0].mimeType,
          size: selectedAttachments[0].size,
          data: selectedAttachments[0].data,
        } : {}),
        success: true,
      },
      message: `Retrieved ${selectedAttachments.length} attachment(s)`,
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
