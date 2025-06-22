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
  const supabase = createSupabaseServerClient()
  
  // Get the user's integration
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single()

  if (error || !integration) {
    throw new Error(`No integration found for ${provider}`)
  }

  // Check if token needs refresh
  const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
    accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
  })

  let accessToken = integration.access_token

  if (shouldRefresh.shouldRefresh && integration.refresh_token) {
    const refreshResult = await TokenRefreshService.refreshTokenForProvider(
      integration.provider,
      integration.refresh_token,
      integration
    )

    if (refreshResult.success && refreshResult.accessToken) {
      accessToken = refreshResult.accessToken
    } else {
      throw new Error(`Failed to refresh ${provider} token`)
    }
  }

  if (!accessToken) {
    throw new Error(`No valid access token for ${provider}`)
  }

  const secret = await getSecret("encryption_key")
  if (!secret) throw new Error("Encryption secret not configured.")

  return decrypt(accessToken, secret)
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
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    const to = resolveValue(config.to, input)
    const subject = resolveValue(config.subject, input)
    const body = resolveValue(config.body, input)

    if (!to || !subject || !body) {
      return { success: false, message: "Missing required fields for sending email: To, Subject, or Body." }
    }

    const email = [
      `Content-Type: text/plain; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      `Content-Transfer-Encoding: 7bit`,
      `to: ${to}`,
      `subject: ${subject}`,
      ``,
      body,
    ].join("\n")

    const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: Buffer.from(email).toString("base64"),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      const errorMessage = result.error?.message || "Failed to send email via Gmail API"
      throw new Error(errorMessage)
    }

    return { success: true, output: { messageId: result.id, status: "sent" } }
  } catch (error: any) {
    return { success: false, message: `Gmail action failed: ${error.message}` }
  }
}

// Add other action handlers here e.g. sendSlackMessage, createGoogleDoc etc.

export async function executeAction(params: ExecuteActionParams): Promise<ActionResult> {
  const { node, input, userId } = params
  const { type, config } = node.data

  switch (type) {
    case "gmail_action_send_email":
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
