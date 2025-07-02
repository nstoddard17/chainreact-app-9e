/**
 * Gmail Send Email Action Handler
 * 
 * Sends an email using the Gmail API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "gmail_action_send_email",
  name: "Send Gmail Message",
  description: "Compose and send an email through your Gmail account",
  icon: "mail"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Converts a plain text string to base64 encoded string
 */
function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Sends an email via the Gmail API
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function sendGmail(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      to, 
      subject, 
      body, 
      cc, 
      bcc, 
      attachments,
      isHtml = false
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!to) {
      return {
        success: false,
        error: "Missing required parameter: to"
      }
    }
    
    if (!subject) {
      return {
        success: false,
        error: "Missing required parameter: subject"
      }
    }
    
    if (!body) {
      return {
        success: false,
        error: "Missing required parameter: body"
      }
    }
    
    // 5. Construct the email headers and body
    const emailLines = [
      `To: ${to}`,
      subject ? `Subject: ${subject}` : '',
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      'Content-Type: ' + (isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'),
      '',
      body
    ]
    
    // Join lines and encode the email
    const emailContent = emailLines.filter(Boolean).join('\r\n')
    const encodedEmail = encodeBase64(emailContent)
    
    // 6. Make Gmail API request
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedEmail
      })
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gmail API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        messageId: data.id,
        threadId: data.threadId,
        labelIds: data.labelIds
      },
      message: "Email sent successfully"
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    console.error("Gmail send email failed:", error)
    return {
      success: false,
      error: error.message || "Failed to send email"
    }
  }
} 