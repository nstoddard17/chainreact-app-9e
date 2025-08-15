import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { FileStorageService } from "@/lib/storage/fileStorage"

/**
 * Sends an email via Gmail API
 * Supports attachments from file storage
 */
export async function sendGmail(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const executionId = `gmail_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`📧 Starting Gmail send process [${executionId}]`, { userId, config: { ...config, body: config.body ? "[CONTENT]" : undefined } })
    
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    // Values are already resolved by execution engine
    const to = config.to
    const cc = config.cc
    const bcc = config.bcc
    const subject = config.subject
    const body = config.body
    const attachmentIds = config.attachments as string[] | undefined

    console.log("Resolved email values:", { to, cc, bcc, subject, hasBody: !!body, attachmentIds: attachmentIds?.length || 0 })

    if (!to || !subject || !body) {
      const missingFields = []
      if (!to) missingFields.push("To")
      if (!subject) missingFields.push("Subject")
      if (!body) missingFields.push("Body")
      
      const message = `Missing required fields for sending email: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Generate boundary for multipart message
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let emailLines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
    ]

    // Remove empty lines
    emailLines = emailLines.filter(line => line !== '')

    // Retrieve attachment files if any
    let attachmentFiles: { fileName: string; content: ArrayBuffer; mimeType: string }[] = []
    if (attachmentIds && attachmentIds.length > 0) {
      try {
        attachmentFiles = await FileStorageService.getFilesFromReferences(attachmentIds, userId)
        console.log(`Retrieved ${attachmentFiles.length} attachment files`)
      } catch (error: any) {
        console.error('Error retrieving attachment files:', error)
        return { success: false, message: `Failed to retrieve attachments: ${error.message}` }
      }
    }

    if (attachmentFiles.length > 0) {
      // Multipart message with attachments
      emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
      emailLines.push('')
      emailLines.push(`--${boundary}`)
      emailLines.push('Content-Type: text/plain; charset="UTF-8"')
      emailLines.push('Content-Transfer-Encoding: 7bit')
      emailLines.push('')
      emailLines.push(body)
      emailLines.push('')

      // Add attachments
      for (const attachment of attachmentFiles) {
        try {
          const base64Content = Buffer.from(attachment.content).toString('base64')
          
          emailLines.push(`--${boundary}`)
          emailLines.push(`Content-Type: ${attachment.mimeType || 'application/octet-stream'}`)
          emailLines.push(`Content-Disposition: attachment; filename="${attachment.fileName}"`)
          emailLines.push('Content-Transfer-Encoding: base64')
          emailLines.push('')
          
          // Split base64 content into 76-character lines (RFC standard)
          const base64Lines = base64Content.match(/.{1,76}/g) || []
          emailLines.push(...base64Lines)
          emailLines.push('')
        } catch (attachmentError) {
          console.error(`Error processing attachment ${attachment.fileName}:`, attachmentError)
          return { success: false, message: `Failed to process attachment: ${attachment.fileName}` }
        }
      }

      emailLines.push(`--${boundary}--`)
    } else {
      // Simple text message
      emailLines.push('Content-Type: text/plain; charset="UTF-8"')
      emailLines.push('Content-Transfer-Encoding: 7bit')
      emailLines.push('')
      emailLines.push(body)
    }

    const email = emailLines.join('\n')

    console.log("Making Gmail API request...")
    const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: Buffer.from(email).toString("base64url"),
      }),
    })

    console.log("Gmail API response status:", response.status)
    
    const result = await response.json()

    if (!response.ok) {
      console.error("Gmail API error:", {
        status: response.status,
        statusText: response.statusText,
        error: result.error
      })
      
      const errorMessage = result.error?.message || `Failed to send email via Gmail API (${response.status})`
      throw new Error(errorMessage)
    }

    console.log(`📧 Gmail send successful [${executionId}]:`, { messageId: result.id })
    
    return {
      success: true,
      output: {
        ...input,
        messageId: result.id,
        threadId: result.threadId,
        to,
        subject,
        sentAt: new Date().toISOString(),
        executionId,
      },
      message: "Email sent successfully via Gmail",
    }
  } catch (error: any) {
    const errorExecutionId = executionId || `gmail_error_${Date.now()}`;
    console.error(`📧 Gmail send error [${errorExecutionId}]:`, error)
    return {
      success: false,
      message: `Failed to send email: ${error.message}`,
      error: error.message,
      executionId: errorExecutionId,
    }
  }
} 