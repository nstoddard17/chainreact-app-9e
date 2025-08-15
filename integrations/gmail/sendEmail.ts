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
    
    console.log(`📧 Gmail sendEmail called with:`)
    console.log(`📧 Config:`, JSON.stringify(config, null, 2))
    console.log(`📧 Input:`, JSON.stringify(input, null, 2))
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config
    // Try to get DataFlowManager from input if available
    const dataFlowManager = input?.dataFlowManager || input?.nodeOutputs ? {
      resolveVariable: (ref: string) => {
        console.log(`📧 Email action trying to resolve: ${ref}`)
        // Simple fallback resolution for node outputs
        if (input.nodeOutputs && typeof ref === 'string') {
          const match = ref.match(/\{\{([^.]+)\.([^}]+)\}\}/)
          if (match) {
            const [, nodeTitle, fieldName] = match
            console.log(`📧 Looking for nodeTitle: ${nodeTitle}, fieldName: ${fieldName}`)
            console.log(`📧 Available nodeOutputs:`, Object.keys(input.nodeOutputs))
            
            // Find node by title (this is a simplified approach)
            for (const [nodeId, output] of Object.entries(input.nodeOutputs)) {
              if (output && (output as any).data) {
                const data = (output as any).data
                if (data[fieldName] !== undefined) {
                  console.log(`📧 Found in node ${nodeId}:`, data[fieldName])
                  return data[fieldName]
                }
                if (data.output !== undefined && (fieldName === "AI Agent Output" || fieldName === "output")) {
                  console.log(`📧 Found AI output in node ${nodeId}:`, data.output)
                  return data.output
                }
              }
            }
          }
        }
        return ref // Return unchanged if not found
      }
    } : undefined
    
    const resolvedConfig = resolveValue(config, {
      input,
    }, dataFlowManager)
    
    console.log(`📧 Resolved config:`, JSON.stringify(resolvedConfig, null, 2))
    
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
    
    console.log(`📧 EXTRACTED PARAMETERS:`)
    console.log(`📧 to: "${to}"`)
    console.log(`📧 subject: "${subject}"`) 
    console.log(`📧 body: "${body}"`)
    console.log(`📧 body type: ${typeof body}`)
    console.log(`📧 body length: ${body ? body.length : 'N/A'}`)
    
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
    
    console.log(`📧 EMAIL LINES:`, emailLines)
    
    // Join lines and encode the email
    const emailContent = emailLines.filter(Boolean).join('\r\n')
    console.log(`📧 FINAL EMAIL CONTENT:`)
    console.log(emailContent)
    console.log(`📧 EMAIL CONTENT LENGTH: ${emailContent.length}`)
    
    const encodedEmail = encodeBase64(emailContent)
    console.log(`📧 ENCODED EMAIL LENGTH: ${encodedEmail.length}`)
    
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