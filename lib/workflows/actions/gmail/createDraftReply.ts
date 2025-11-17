import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a draft reply to an existing email in Gmail
 */
export async function createGmailDraftReply(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message details from config
    const messageId = resolveValue(config.messageId, input)
    const threadId = resolveValue(config.threadId, input)
    const body = resolveValue(config.body, input)
    const cc = resolveValue(config.cc, input)
    const bcc = resolveValue(config.bcc, input)
    const attachments = resolveValue(config.attachments, input)

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Original message ID is required to create a reply',
      }
    }

    logger.debug(`[Gmail Create Draft Reply] Creating draft reply to message ${messageId}`)

    // Fetch the original message to get headers
    const originalResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!originalResponse.ok) {
      throw new Error(`Failed to fetch original message: ${originalResponse.status}`)
    }

    const originalMessage = await originalResponse.json()
    const headers = originalMessage.payload?.headers || []

    // Extract headers
    const getHeader = (name: string) => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
      return header?.value || ''
    }

    const originalFrom = getHeader('From')
    const originalSubject = getHeader('Subject')
    const originalMessageId = getHeader('Message-ID')
    const originalThreadId = threadId || originalMessage.threadId

    // Build reply headers with MIME multipart support
    const replySubject = originalSubject.startsWith('Re: ')
      ? originalSubject
      : `Re: ${originalSubject}`

    const boundary = `boundary_${Date.now()}`
    const messageParts = []

    // Add headers
    messageParts.push(`To: ${originalFrom}`)
    messageParts.push(`Subject: ${replySubject}`)
    messageParts.push(`In-Reply-To: ${originalMessageId}`)
    messageParts.push(`References: ${originalMessageId}`)

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
        logger.error('[Gmail Create Draft Reply] Failed to attach file:', error)
      }
    }

    messageParts.push(`--${boundary}--`)

    // Encode email
    const email = messageParts.join('\r\n')
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Create draft reply
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
            threadId: originalThreadId,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to create draft reply: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[Gmail Create Draft Reply] Successfully created draft reply:', result.id)

    return {
      success: true,
      output: {
        ...input,
        draftId: result.id,
        messageId: result.message?.id,
        threadId: originalThreadId,
        success: true,
        replyingTo: messageId,
        subject: replySubject,
        createdAt: new Date().toISOString(),
      },
      message: 'Draft reply created successfully',
    }
  } catch (error: any) {
    logger.error('[Gmail Create Draft Reply] Error:', error)
    return {
      success: false,
      message: `Failed to create draft reply: ${error.message}`,
      error: error.message,
    }
  }
}
