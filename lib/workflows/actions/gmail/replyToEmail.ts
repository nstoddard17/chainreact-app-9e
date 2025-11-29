import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { deleteWorkflowTempFiles } from '@/lib/utils/workflowFileCleanup'
import { logger } from '@/lib/utils/logger'

/**
 * Sends a reply to an existing email in Gmail
 */
export async function replyToGmailEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  const cleanupPaths = new Set<string>()

  try {
    const accessToken = await getDecryptedAccessToken(userId, 'gmail')

    // Get message details from config
    const messageId = resolveValue(config.messageId, input)
    const threadId = resolveValue(config.threadId, input)
    const body = resolveValue(config.body, input)
    const replyAll = resolveValue(config.replyAll, input) === true
    const customSubject = resolveValue(config.subject, input)
    const attachments = resolveValue(config.attachments, input)
    const signature = resolveValue(config.signature, input)

    if (!messageId || !messageId.trim()) {
      return {
        success: false,
        message: 'Original message ID is required to send a reply',
      }
    }

    if (!body || !body.trim()) {
      return {
        success: false,
        message: 'Reply body is required',
      }
    }

    logger.debug(`[Gmail Reply] Configuration values:`, {
      hasCustomSubject: !!customSubject,
      attachmentsType: typeof attachments,
      attachmentsValue: JSON.stringify(attachments),
      attachmentsIsArray: Array.isArray(attachments)
    })

    // Fetch the original message to get headers
    const originalResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`,
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
    const originalTo = getHeader('To')
    const originalCc = getHeader('Cc')
    const originalSubject = getHeader('Subject')
    const originalMessageId = getHeader('Message-ID')
    const originalThreadId = threadId || originalMessage.threadId

    // Build reply headers
    // Use custom subject if provided, otherwise auto-generate "Re: " prefix
    let replySubject: string
    if (customSubject && customSubject.trim()) {
      replySubject = customSubject.trim()
    } else {
      replySubject = originalSubject.startsWith('Re: ')
        ? originalSubject
        : `Re: ${originalSubject}`
    }

    const replyHeaders = [
      `To: ${originalFrom}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
    ]

    // Add Cc if replying to all
    if (replyAll) {
      const ccAddresses = []

      // Add original To addresses (except ourselves)
      if (originalTo) {
        ccAddresses.push(originalTo)
      }

      // Add original Cc addresses
      if (originalCc) {
        ccAddresses.push(originalCc)
      }

      if (ccAddresses.length > 0) {
        replyHeaders.push(`Cc: ${ccAddresses.join(', ')}`)
      }
    }

    // Prepare final body with signature
    let finalBody = body
    if (signature) {
      finalBody = `${body}<br><br>${signature}`
    }

    // Build MIME message with attachments support
    const boundary = `boundary_${Date.now()}`
    const messageParts = []

    // Add headers
    for (const header of replyHeaders) {
      messageParts.push(header)
    }

    // Process attachments - can be from file uploads OR variables
    let allAttachments = []

    if (attachments) {
      // Handle different attachment formats
      if (Array.isArray(attachments)) {
        // Array of attachments (from variables like {{node.attachments}} or multiple uploads)
        allAttachments = attachments
        logger.debug(`[Gmail Reply] Found ${attachments.length} attachment(s) from array`)
      } else if (typeof attachments === 'object' && attachments.attachments && Array.isArray(attachments.attachments)) {
        // Handle case where entire Get Attachment output is passed (has .attachments property)
        allAttachments = attachments.attachments
        logger.debug(`[Gmail Reply] Detected Get Attachment output format with attachments array`)
      } else if (typeof attachments === 'object') {
        // Single attachment object
        allAttachments = [attachments]
        logger.debug(`[Gmail Reply] Found single attachment object`)
      } else if (typeof attachments === 'string') {
        // Could be a file ID or raw base64 - treat as single attachment
        allAttachments = [attachments]
        logger.debug(`[Gmail Reply] Found attachment string (file ID or base64)`)
      }
    }

    logger.debug(`[Gmail Reply] Total attachments to process: ${allAttachments.length}`)

    // Check if we have attachments to include
    const hasAttachments = allAttachments.length > 0

    if (hasAttachments) {
      messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
      messageParts.push('')
      messageParts.push(`--${boundary}`)
    }

    // Add body
    messageParts.push('Content-Type: text/html; charset=utf-8')
    messageParts.push('')
    messageParts.push(finalBody)

    // Process and add attachments
    if (hasAttachments) {
      const attachmentList = allAttachments

      for (const attachment of attachmentList) {
        try {
          logger.debug(`[Gmail Reply] Processing attachment:`, {
            type: typeof attachment,
            isArray: Array.isArray(attachment),
            keys: typeof attachment === 'object' ? Object.keys(attachment || {}) : 'N/A',
            hasData: attachment && typeof attachment === 'object' ? !!attachment.data : false,
            hasFilename: attachment && typeof attachment === 'object' ? !!attachment.filename : false,
            hasContent: attachment && typeof attachment === 'object' ? !!attachment.content : false
          })

          let fileData: any = null

          // Track temporary files for cleanup
          if (
            attachment &&
            typeof attachment === 'object' &&
            attachment.isTemporary &&
            typeof attachment.filePath === 'string'
          ) {
            cleanupPaths.add(attachment.filePath)
          }

          // Handle different attachment formats
          if (typeof attachment === 'string') {
            // Raw base64 string - try to use it with a generic filename
            // This handles cases like {{node.data}} where just the base64 is passed
            logger.warn('[Gmail Reply] Received raw base64 string for attachment - using generic filename')
            fileData = {
              data: attachment,
              fileName: 'attachment',
              mimeType: 'application/octet-stream'
            }
          } else if (attachment && typeof attachment === 'object' && attachment.data && (attachment.filename || attachment.fileName)) {
            // Gmail Get Attachment format: {attachmentId, filename, mimeType, size, data}
            // Convert base64url to base64 and add proper padding
            let base64Data = attachment.data
              .replace(/-/g, '+')
              .replace(/_/g, '/')

            // Add padding if needed
            while (base64Data.length % 4) {
              base64Data += '='
            }

            fileData = {
              data: base64Data,
              fileName: attachment.filename || attachment.fileName,
              mimeType: attachment.mimeType || 'application/octet-stream'
            }

            logger.debug('[Gmail Reply] Processed Gmail attachment:', {
              originalFilename: attachment.filename || attachment.fileName,
              mimeType: attachment.mimeType,
              dataLengthBefore: attachment.data?.length,
              dataLengthAfter: base64Data?.length
            })
          } else if (attachment && typeof attachment === 'object' && attachment.content && attachment.fileName) {
            // File with inline content (from variables like attachment data)
            fileData = {
              data: attachment.content,
              fileName: attachment.fileName || attachment.name || 'attachment',
              mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
            }
          } else if (attachment && typeof attachment === 'object' && attachment.id) {
            // File uploaded via the file upload field
            try {
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
            } catch (error) {
              logger.error('[Gmail Reply] Error fetching file from storage:', error)
            }
          } else if (attachment && typeof attachment === 'object' && attachment.filePath) {
            // Temporary file from storage
            try {
              const { createClient } = await import('@supabase/supabase-js')
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
              const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!
              const supabase = createClient(supabaseUrl, supabaseServiceKey)

              const { data: storageFile, error } = await supabase.storage
                .from('workflow-files')
                .download(attachment.filePath)

              if (!error && storageFile) {
                const arrayBuffer = await storageFile.arrayBuffer()
                const base64Content = Buffer.from(arrayBuffer).toString('base64')

                fileData = {
                  data: base64Content,
                  fileName: attachment.fileName || attachment.name || 'attachment',
                  mimeType: attachment.mimeType || attachment.fileType || attachment.type || 'application/octet-stream'
                }
              }
            } catch (error) {
              logger.error('[Gmail Reply] Error downloading file from storage:', error)
            }
          }

          // Add attachment to MIME message
          if (fileData && fileData.data) {
            logger.debug(`[Gmail Reply] Adding attachment to email:`, {
              fileName: fileData.fileName,
              mimeType: fileData.mimeType,
              dataLength: fileData.data?.length || 0
            })
            messageParts.push('')
            messageParts.push(`--${boundary}`)
            messageParts.push(`Content-Type: ${fileData.mimeType}; name="${fileData.fileName}"`)
            messageParts.push('Content-Transfer-Encoding: base64')
            messageParts.push(`Content-Disposition: attachment; filename="${fileData.fileName}"`)
            messageParts.push('')
            messageParts.push(fileData.data)
          } else {
            logger.warn(`[Gmail Reply] Skipping attachment - no file data extracted`)
          }
        } catch (error) {
          logger.error('[Gmail Reply] Error processing attachment:', error)
        }
      }

      // Close boundary
      messageParts.push('')
      messageParts.push(`--${boundary}--`)
    }

    // Encode email
    const email = messageParts.join('\r\n')
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send reply
    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
          threadId: originalThreadId,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to send reply: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[Gmail Reply] Successfully sent reply:', result.id)

    return {
      success: true,
      output: {
        ...input,
        messageId: result.id,
        threadId: result.threadId,
        success: true,
        replyingTo: messageId,
        replyAll,
        subject: replySubject,
        sentAt: new Date().toISOString(),
      },
      message: replyAll ? 'Reply sent to all recipients' : 'Reply sent successfully',
    }
  } catch (error: any) {
    logger.error('[Gmail Reply] Error:', error)
    return {
      success: false,
      message: `Failed to send reply: ${error.message}`,
      error: error.message,
    }
  } finally {
    // Cleanup temporary files
    if (cleanupPaths.size > 0) {
      await deleteWorkflowTempFiles(cleanupPaths)
    }
  }
}
