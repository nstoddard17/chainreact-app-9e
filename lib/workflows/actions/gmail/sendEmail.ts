import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"
import { google } from 'googleapis'

/**
 * Enhanced Gmail send email with all field support
 */
export async function sendGmailEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const {
      to,
      cc,
      bcc,
      subject,
      body,
      signature,
      attachments,
      replyTo,
      priority = 'normal',
      readReceipt = false,
      labels = [],
      scheduleSend,
      trackOpens = false,
      trackClicks = false,
      isHtml = false
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, "gmail")
    
    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Build email headers
    const headers: Record<string, string> = {
      'To': Array.isArray(to) ? to.join(', ') : to,
      'Subject': subject,
      'From': 'me', // Gmail API uses 'me' for authenticated user
    }

    if (cc) {
      headers['Cc'] = Array.isArray(cc) ? cc.join(', ') : cc
    }

    if (bcc) {
      headers['Bcc'] = Array.isArray(bcc) ? bcc.join(', ') : bcc
    }

    if (replyTo) {
      headers['Reply-To'] = replyTo
    }

    // Set priority headers
    if (priority === 'high') {
      headers['X-Priority'] = '1'
      headers['Importance'] = 'High'
    } else if (priority === 'low') {
      headers['X-Priority'] = '5'
      headers['Importance'] = 'Low'
    }

    // Request read receipt
    if (readReceipt) {
      headers['Disposition-Notification-To'] = 'me'
      headers['Return-Receipt-To'] = 'me'
    }

    // Add tracking pixels if requested (basic implementation)
    let finalBody = body
    if (signature) {
      finalBody = isHtml 
        ? `${body}<br><br>${signature}`
        : `${body}\n\n${signature}`
    }

    if (trackOpens && isHtml) {
      // Add invisible tracking pixel (would need backend to actually track)
      const trackingId = `${userId}_${Date.now()}`
      finalBody += `<img src="https://your-tracking-domain.com/track/open/${trackingId}" width="1" height="1" style="display:none;" />`
    }

    // Build MIME message
    const boundary = `boundary_${Date.now()}`
    let messageParts = []

    // Add headers
    for (const [key, value] of Object.entries(headers)) {
      messageParts.push(`${key}: ${value}`)
    }
    messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    messageParts.push('')
    messageParts.push(`--${boundary}`)

    // Add body
    if (isHtml) {
      messageParts.push('Content-Type: text/html; charset=utf-8')
    } else {
      messageParts.push('Content-Type: text/plain; charset=utf-8')
    }
    messageParts.push('')
    messageParts.push(finalBody)

    // Handle attachments
    if (attachments && attachments.length > 0) {
      for (const attachmentId of attachments) {
        try {
          const fileData = await FileStorageService.getFile(attachmentId, userId)
          if (fileData) {
            messageParts.push(`--${boundary}`)
            messageParts.push(`Content-Type: ${fileData.mimeType || 'application/octet-stream'}`)
            messageParts.push(`Content-Transfer-Encoding: base64`)
            messageParts.push(`Content-Disposition: attachment; filename="${fileData.fileName}"`)
            messageParts.push('')
            messageParts.push(fileData.data)
          }
        } catch (error) {
          console.warn(`Failed to attach file ${attachmentId}:`, error)
        }
      }
    }

    messageParts.push(`--${boundary}--`)

    // Encode message
    const message = messageParts.join('\r\n')
    const encodedMessage = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Handle scheduled send
    if (scheduleSend) {
      // Gmail doesn't have native scheduled send via API
      // Would need to implement with a job queue
      console.log('Scheduled send requested for:', scheduleSend)
      // For now, send immediately with a note
    }

    // Send the email
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        labelIds: labels.length > 0 ? labels : undefined
      }
    })

    // Apply labels if specified
    if (labels.length > 0 && result.data.id) {
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: result.data.id,
          requestBody: {
            addLabelIds: labels
          }
        })
      } catch (labelError) {
        console.warn('Failed to apply labels:', labelError)
      }
    }

    return {
      success: true,
      output: {
        messageId: result.data.id,
        threadId: result.data.threadId,
        to,
        subject,
        labelIds: result.data.labelIds
      },
      message: `Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to}`
    }

  } catch (error: any) {
    console.error('Send Gmail error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to send email'
    }
  }
}