import { cookies } from "next/headers"
import { createAdminSupabaseClient, parseOAuthState, upsertIntegration } from "./utils"

export function generateCodeVerifier(): string {
  let codeVerifier = ""
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

  for (let i = 0; i < 128; i++) {
    codeVerifier += possible.charAt(Math.floor(Math.random() * possible.length))
  }

  return codeVerifier
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data)
  const buffer = Buffer.from(digest)
  const codeChallenge = buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  return codeChallenge
}

interface CallbackResult {
  success: boolean
  message?: string
  error?: string
}

declare function getProviderHandler(provider: string): any

export async function handleCallback(provider: string, code: string, state: string): Promise<CallbackResult> {
  try {
    console.log(`Handling OAuth callback for ${provider}`)

    // Verify state parameter
    const cookieStore = cookies()
    const storedState = cookieStore.get(`oauth_state_${provider}`)?.value

    if (!storedState || storedState !== state) {
      throw new Error("Invalid or expired state parameter")
    }

    // Clear the state cookie
    cookieStore.set(`oauth_state_${provider}`, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    })

    // Parse state to get user information
    const stateData = parseOAuthState(state)
    const userId = stateData.userId

    if (!userId) {
      throw new Error("User ID not found in state")
    }

    // Get provider handler
    const handler = getProviderHandler(provider)
    if (!handler) {
      throw new Error(`No handler found for provider: ${provider}`)
    }

    // Exchange code for tokens
    const tokenData = await handler.exchangeCodeForToken(code)

    // Get user info from provider
    const userInfo = await handler.getUserInfo(tokenData.access_token)

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider,
      provider_user_id: userInfo.id || userInfo.user_id || userInfo.sub || userInfo.login,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(/[, ]/).filter(Boolean) : [],
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      metadata: {
        ...userInfo,
        connected_at: new Date().toISOString(),
        token_type: tokenData.token_type || "Bearer",
      },
    }

    // Save to database
    const supabase = createAdminSupabaseClient()
    await upsertIntegration(supabase, integrationData)

    // Log successful connection
    await supabase.from("token_audit_log").insert({
      user_id: userId,
      provider,
      action: stateData.reconnect ? "reconnected" : "connected",
      status: "success",
      details: {
        scopes: integrationData.scopes,
        provider_user_id: integrationData.provider_user_id,
      },
    })

    return {
      success: true,
      message: `${provider} connected successfully`,
    }
  } catch (error: any) {
    console.error(`Error handling ${provider} callback:`, error)

    // Log failed connection attempt
    try {
      const stateData = parseOAuthState(state)
      if (stateData.userId) {
        const supabase = createAdminSupabaseClient()
        await supabase.from("token_audit_log").insert({
          user_id: stateData.userId,
          provider,
          action: "connection_failed",
          status: "error",
          details: {
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        })
      }
    } catch (logError) {
      console.error("Failed to log error:", logError)
    }

    return {
      success: false,
      error: error.message || `Failed to connect ${provider}`,
    }
  }
}
