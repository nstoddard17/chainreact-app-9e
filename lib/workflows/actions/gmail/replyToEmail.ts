import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Sends a reply to an existing email in Gmail
 */
export async function replyToGmailEmail(
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
    const replyAll = resolveValue(config.replyAll, input) === true

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

    logger.debug(`[Gmail Reply] Sending ${replyAll ? 'reply all' : 'reply'} to message ${messageId}`)

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
    const replySubject = originalSubject.startsWith('Re: ')
      ? originalSubject
      : `Re: ${originalSubject}`

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

    replyHeaders.push('Content-Type: text/html; charset=utf-8')
    replyHeaders.push('')
    replyHeaders.push(body)

    // Encode email
    const email = replyHeaders.join('\r\n')
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
  }
}
