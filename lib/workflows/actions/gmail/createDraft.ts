import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a draft email in Gmail
 */
export async function createGmailDraft(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get email details from config
    const to = resolveValue(config.to, input)
    const subject = resolveValue(config.subject, input)
    const body = resolveValue(config.body, input)
    const cc = resolveValue(config.cc, input)
    const bcc = resolveValue(config.bcc, input)
    const attachments = resolveValue(config.attachments, input)

    if (!to || !to.trim()) {
      return {
        success: false,
        message: 'Recipient email address is required',
      }
    }

    logger.debug('[Gmail Create Draft] Creating draft email')

    // Build MIME message with multipart support for attachments
    const boundary = `boundary_${Date.now()}`
    const messageParts = []

    // Add headers
    messageParts.push(`To: ${to}`)
    messageParts.push(`Subject: ${subject || '(No Subject)'}`)

    if (cc && cc.trim()) {
      messageParts.push(`Cc: ${cc}`)
    }

    if (bcc && bcc.trim()) {
      messageParts.push(`Bcc: ${bcc}`)
    }

    messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    messageParts.push('')
    messageParts.push(`--${boundary}`)

    // Add body
    messageParts.push('Content-Type: text/html; charset=utf-8')
    messageParts.push('')
    messageParts.push(body || '')

    // Handle attachments
    const attachmentList = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : [])

    for (const attachment of attachmentList) {
      try {
        let fileData: any = null

        // Check if it's an uploaded file object with id
        if (attachment && typeof attachment === 'object' && attachment.id) {
          const storedFile = await FileStorageService.getFile(attachment.id, userId)
          if (storedFile) {
            const arrayBuffer = await storedFile.file.arrayBuffer()
            const base64Content = Buffer.from(arrayBuffer).toString('base64')

            fileData = {
              data: base64Content,
              fileName: attachment.fileName || storedFile.fileName || 'attachment',
              mimeType: attachment.fileType || storedFile.fileType || 'application/octet-stream'
            }
          }
        } else if (attachment && typeof attachment === 'object' && attachment.content && attachment.fileName) {
          // File with inline content
          fileData = {
            data: attachment.content,
            fileName: attachment.fileName || attachment.name || 'attachment',
            mimeType: attachment.mimeType || attachment.fileType || 'application/octet-stream'
          }
        } else if (typeof attachment === 'string') {
          // File ID from FileStorageService
          fileData = await FileStorageService.getFile(attachment, userId)
        }

        if (fileData) {
          messageParts.push(`--${boundary}`)
          messageParts.push(`Content-Type: ${fileData.mimeType || 'application/octet-stream'}`)
          messageParts.push(`Content-Transfer-Encoding: base64`)
          messageParts.push(`Content-Disposition: attachment; filename="${fileData.fileName}"`)
          messageParts.push('')
          messageParts.push(fileData.data)
        }
      } catch (error) {
        logger.error('[Gmail Create Draft] Failed to attach file:', error)
      }
    }

    messageParts.push(`--${boundary}--`)

    // Combine into RFC 2822 format and encode as base64url
    const email = messageParts.join('\r\n')
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Create draft
    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            raw: encodedEmail,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to create draft: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[Gmail Create Draft] Successfully created draft:', result.id)

    return {
      success: true,
      output: {
        ...input,
        draftId: result.id,
        messageId: result.message?.id,
        success: true,
        to,
        subject: subject || '(No Subject)',
        createdAt: new Date().toISOString(),
      },
      message: 'Draft email created successfully',
    }
  } catch (error: any) {
    logger.error('[Gmail Create Draft] Error:', error)
    return {
      success: false,
      message: `Failed to create draft: ${error.message}`,
      error: error.message,
    }
  }
}
