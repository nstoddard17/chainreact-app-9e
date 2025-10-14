/**
 * Gmail Send Email Action Handler
 * 
 * Sends an email using the Gmail API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

import { logger } from '@/lib/utils/logger'

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
 * Formats email body for professional appearance
 */
function formatEmailBody(body: string, isHtml: boolean = false): string {
  if (isHtml) {
    // For HTML emails, wrap in proper HTML structure with clean styling
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333;
            max-width: 600px;
            margin: 0;
            padding: 20px;
        }
        p { 
            margin: 16px 0; 
        }
    </style>
</head>
<body>
    ${body.replace(/\n/g, '<br>')}
</body>
</html>`.trim()
  } else {
    // For plain text emails, just clean up formatting
    return body
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
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
    
    logger.debug(`📧 Gmail sendEmail called with:`)
    logger.debug(`📧 Config:`, JSON.stringify(config, null, 2))
    logger.debug(`📧 Input:`, JSON.stringify(input, null, 2))
    
    // 1. Get Gmail OAuth token
    const credentials = await getIntegrationCredentials(userId, "gmail")
    
    // 2. Resolve any templated values in the config using the enhanced DataFlowManager
    let dataFlowManager = input?.dataFlowManager
    
    // If we don't have a DataFlowManager, create a simple fallback
    if (!dataFlowManager && input?.nodeOutputs) {
      logger.debug(`📧 Creating fallback DataFlowManager`)
      dataFlowManager = {
        resolveVariable: (ref: string) => {
          logger.debug(`📧 Fallback resolver trying to resolve: ${ref}`)
          if (typeof ref === 'string') {
            const match = ref.match(/\{\{([^.]+)\.([^}]+)\}\}/)
            if (match) {
              const [, nodeTitle, fieldName] = match
              logger.debug(`📧 Looking for nodeTitle: ${nodeTitle}, fieldName: ${fieldName}`)
              logger.debug(`📧 Available nodeOutputs:`, Object.keys(input.nodeOutputs))
              
              // Find node by title in the stored outputs
              for (const [nodeId, output] of Object.entries(input.nodeOutputs)) {
                if (output && (output as any).data) {
                  const data = (output as any).data
                  // Check for exact field match
                  if (data[fieldName] !== undefined) {
                    logger.debug(`📧 Found field "${fieldName}" in node ${nodeId}:`, data[fieldName])
                    return data[fieldName]
                  }
                  // Special handling for AI Agent outputs
                  if (data.output !== undefined && (fieldName === "AI Agent Output" || fieldName === "output")) {
                    logger.debug(`📧 Found AI output in node ${nodeId}:`, data.output)
                    return data.output
                  }
                }
              }
            }
          }
          logger.debug(`📧 Could not resolve variable: ${ref}`)
          return ref // Return unchanged if not found
        }
      }
    }
    
    logger.debug(`📧 Using DataFlowManager:`, dataFlowManager ? 'Available' : 'Not available')
    
    const resolvedConfig = resolveValue(config, {
      input,
    }, dataFlowManager)
    
    logger.debug(`📧 Resolved config:`, JSON.stringify(resolvedConfig, null, 2))
    
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
    
    logger.debug(`📧 EXTRACTED PARAMETERS:`)
    logger.debug(`📧 to: "${to}"`)
    logger.debug(`📧 subject: "${subject}"`) 
    logger.debug(`📧 body: "${body}"`)
    logger.debug(`📧 body type: ${typeof body}`)
    logger.debug(`📧 body length: ${body ? body.length : 'N/A'}`)
    
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
    
    // 4.5. Format email body for professional appearance
    const formattedBody = formatEmailBody(body, isHtml)
    
    // 5. Construct the email headers and body
    const emailLines = [
      `To: ${to}`,
      subject ? `Subject: ${subject}` : '',
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      'Content-Type: ' + (isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'),
      '',
      formattedBody
    ]
    
    logger.debug(`📧 EMAIL LINES:`, emailLines)
    
    // Join lines and encode the email
    const emailContent = emailLines.filter(Boolean).join('\r\n')
    logger.debug(`📧 FINAL EMAIL CONTENT:`)
    logger.debug(emailContent)
    logger.debug(`📧 EMAIL CONTENT LENGTH: ${emailContent.length}`)
    
    const encodedEmail = encodeBase64(emailContent)
    logger.debug(`📧 ENCODED EMAIL LENGTH: ${encodedEmail.length}`)
    
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
    logger.error("Gmail send email failed:", error)
    return {
      success: false,
      error: error.message || "Failed to send email"
    }
  }
} 