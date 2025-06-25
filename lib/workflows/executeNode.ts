import { TokenRefreshService } from "../integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

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
    const supabase = createSupabaseServerClient()
    
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
    const decryptedToken = decrypt(accessToken, secret)
    console.log(`Successfully decrypted access token for ${provider}`)
    
    return decryptedToken
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
    
    // Verify Gmail send scope
    try {
      const scopeResponse = await fetch("https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + encodeURIComponent(accessToken))
      if (scopeResponse.ok) {
        const scopeData = await scopeResponse.json()
        const hasGmailSendScope = scopeData.scope?.includes("gmail.send") || scopeData.scope?.includes("gmail.modify")
        if (!hasGmailSendScope) {
          console.warn("Gmail integration may not have send permissions. Required scope: gmail.send")
        } else {
          console.log("Gmail send scope verified")
        }
      }
    } catch (scopeError) {
      console.warn("Could not verify Gmail scopes:", scopeError)
    }

    const to = resolveValue(config.to, input)
    const cc = resolveValue(config.cc, input)
    const bcc = resolveValue(config.bcc, input)
    const subject = resolveValue(config.subject, input)
    const body = resolveValue(config.body, input)

    console.log("Resolved email values:", { to, cc, bcc, subject, hasBody: !!body })

    if (!to || !subject || !body) {
      const missingFields = []
      if (!to) missingFields.push("To")
      if (!subject) missingFields.push("Subject")
      if (!body) missingFields.push("Body")
      
      const message = `Missing required fields for sending email: ${missingFields.join(", ")}`
      console.error(message)
      return { success: false, message }
    }

    // Get the user's Gmail address to use as sender
    let userEmail = "me@gmail.com" // fallback
    try {
      console.log("Fetching user's Gmail profile...")
      const profileResponse = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        userEmail = profileData.emailAddress
        console.log("User's Gmail address:", userEmail)
      } else {
        console.warn("Failed to fetch Gmail profile, using fallback sender")
      }
    } catch (error: any) {
      console.warn("Error fetching Gmail profile:", error.message)
    }

    // Use user's actual Gmail address or custom from address
    const fromAddress = config.from || userEmail
    
    // Determine if body contains HTML
    const isHtmlBody = body.includes('<') && body.includes('>')
    const contentType = isHtmlBody ? "text/html" : "text/plain"
    
    // Format the email body
    let emailBody = body
    if (!isHtmlBody) {
      // Convert plain text to basic HTML for better formatting
      emailBody = [
        `<!DOCTYPE html>`,
        `<html>`,
        `<head><meta charset="UTF-8"><title>${subject}</title></head>`,
        `<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">`,
        `<div style="max-width: 600px; margin: 0 auto;">`,
        body.replace(/\n/g, '<br>'),
        `</div>`,
        `</body>`,
        `</html>`,
      ].join("\n")
    }

    // Build email headers
    const headers = [
      `Content-Type: ${contentType}; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      `Content-Transfer-Encoding: 7bit`,
      `From: ${fromAddress}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: <${Date.now()}-${Math.random().toString(36).substr(2, 9)}@gmail.com>`,
      `Date: ${new Date().toUTCString()}`,
      `X-Mailer: Gmail API`,
    ]
    
    // Add CC and BCC if provided
    if (cc) {
      headers.push(`Cc: ${cc}`)
    }
    if (bcc) {
      headers.push(`Bcc: ${bcc}`)
    }
    
    const email = [
      ...headers,
      ``,
      emailBody,
    ].join("\n")

    console.log("Making Gmail API request...")
    console.log("Email details:", { 
      from: fromAddress, 
      to, 
      cc: cc || null,
      bcc: bcc || null,
      subject, 
      bodyLength: emailBody.length,
      contentType 
    })
    
    const emailBase64 = Buffer.from(email).toString("base64")
    console.log("Email base64 length:", emailBase64.length)
    
    const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: emailBase64,
      }),
    })

    console.log("Gmail API response status:", response.status)
    
    const result = await response.json()

    if (!response.ok) {
      console.error("Gmail API error:", {
        status: response.status,
        statusText: response.statusText,
        error: result.error,
        requestDetails: {
          to,
          cc: cc || null,
          bcc: bcc || null,
          from: fromAddress,
          subject,
          emailLength: email.length
        }
      })
      
      const errorMessage = result.error?.message || `Failed to send email via Gmail API (${response.status})`
      throw new Error(errorMessage)
    }

    console.log("Gmail send successful:", { 
      messageId: result.id,
      to,
      cc: cc || null,
      bcc: bcc || null,
      from: fromAddress,
      subject,
      timestamp: new Date().toISOString()
    })
    
    return { 
      success: true, 
      output: { 
        messageId: result.id, 
        status: "sent",
        to,
        cc: cc || null,
        bcc: bcc || null,
        from: fromAddress,
        subject,
        sentAt: new Date().toISOString()
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
