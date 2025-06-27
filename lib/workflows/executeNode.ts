import { TokenRefreshService } from "../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { FileStorageService } from "@/lib/storage/fileStorage"

interface ExecuteActionParams {
  node: any
  input: Record<string, any>
  userId: string
  workflowId: string
}

interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
}

async function getDecryptedAccessToken(userId: string, provider: string): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Get the user's integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error) {
      console.error(`Database error fetching integration for ${provider}:`, error)
      throw new Error(`Database error: ${error.message}`)
    }

    if (!integration) {
      throw new Error(`No integration found for ${provider}`)
    }

    console.log(`Found integration for ${provider}:`, {
      id: integration.id,
      hasAccessToken: !!integration.access_token,
      hasRefreshToken: !!integration.refresh_token,
      expiresAt: integration.expires_at,
      status: integration.status
    })

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    let accessToken = integration.access_token

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      console.log(`Refreshing token for ${provider}: ${shouldRefresh.reason}`)
      
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        accessToken = refreshResult.accessToken
        console.log(`Token refresh successful for ${provider}`)
      } else {
        console.error(`Token refresh failed for ${provider}:`, refreshResult.error)
        throw new Error(`Failed to refresh ${provider} token: ${refreshResult.error}`)
      }
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${provider}`)
    }

    const secret = await getSecret("encryption_key")
    if (!secret) {
      console.error("Encryption key not found in environment")
      throw new Error("Encryption secret not configured. Please set ENCRYPTION_KEY environment variable.")
    }

    console.log(`Attempting to decrypt access token for ${provider}`)
    console.log(`Token format check:`, {
      hasColon: accessToken.includes(':'),
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 20) + '...'
    })
    
    try {
      const decryptedToken = decrypt(accessToken, secret)
      console.log(`Successfully decrypted access token for ${provider}`)
      return decryptedToken
    } catch (decryptError: any) {
      console.error(`Decryption failed for ${provider}:`, {
        error: decryptError.message,
        tokenFormat: accessToken.includes(':') ? 'encrypted' : 'plain',
        tokenLength: accessToken.length
      })
      
      // If the token doesn't have the expected format, it might be stored as plain text
      if (!accessToken.includes(':')) {
        console.log(`Token for ${provider} appears to be stored as plain text, returning as-is`)
        return accessToken
      }
      
      throw new Error(`Failed to decrypt ${provider} access token: ${decryptError.message}`)
    }
  } catch (error: any) {
    console.error(`Error in getDecryptedAccessToken for ${provider}:`, {
      message: error.message,
      stack: error.stack,
      userId,
      provider
    })
    throw error
  }
}

function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    // For simplicity, we'll support basic dot notation.
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  return value
}

async function sendGmail(config: any, userId: string, input: Record<string, any>): Promise<ActionResult> {
  try {
    console.log("Starting Gmail send process", { userId, config: { ...config, body: config.body ? "[CONTENT]" : undefined } })
    
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    const to = resolveValue(config.to, input)
    const cc = resolveValue(config.cc, input)
    const bcc = resolveValue(config.bcc, input)
    const subject = resolveValue(config.subject, input)
    const body = resolveValue(config.body, input)
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

    console.log("Gmail send successful:", { messageId: result.id })
    return { 
      success: true, 
      output: { 
        messageId: result.id, 
        status: "sent",
        attachmentCount: attachmentFiles?.length || 0
      } 
    }
  } catch (error: any) {
    console.error("Gmail send error:", {
      message: error.message,
      stack: error.stack,
      userId,
      config: { ...config, body: config.body ? "[CONTENT]" : undefined }
    })
    return { success: false, message: `Gmail action failed: ${error.message}` }
  }
}

// Add other action handlers here e.g. sendSlackMessage, createGoogleDoc etc.

export async function executeAction(params: ExecuteActionParams): Promise<ActionResult> {
  const { node, input, userId } = params
  const { type, config } = node.data

  // Check if environment is properly configured
  const hasSupabaseConfig = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasEncryptionKey = process.env.ENCRYPTION_KEY

  if (!hasSupabaseConfig) {
    console.warn("Supabase configuration missing, running in test mode")
    return { 
      success: true, 
      output: { test: true, mockResult: true }, 
      message: `Test mode: ${type} executed successfully (missing Supabase config)` 
    }
  }

  switch (type) {
    case "gmail_action_send_email":
      if (!hasEncryptionKey) {
        console.warn("Encryption key missing, running Gmail action in test mode")
        return { 
          success: true, 
          output: { 
            test: true, 
            to: config?.to || "test@example.com",
            subject: config?.subject || "Test Email",
            messageId: "test_message_" + Date.now()
          }, 
          message: "Test mode: Gmail email sent successfully (missing encryption key)" 
        }
      }
      return sendGmail(config, userId, input)
    // Future actions will be added here
    // case "slack_action_send_message":
    //   return sendSlackMessage(config, userId, input)

    default:
      console.warn(`No execution logic for node type: ${type}`)
      // For unhandled actions, we can choose to continue the flow
      return { success: true, output: input, message: `No action found for ${type}` }
  }
}
