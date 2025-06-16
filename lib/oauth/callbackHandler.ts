import { createAdminSupabaseClient, upsertIntegration, parseOAuthState } from "./utils"
import { getOAuthProvider } from "./index"

export interface CallbackResult {
  success: boolean
  error?: string
  message?: string
  provider?: string
}

export async function handleOAuthCallback(provider: string, code: string, state: string): Promise<CallbackResult> {
  try {
    console.log(`🔄 Processing OAuth callback for ${provider}`)

    // Parse and validate state
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error: any) {
      console.error("Invalid state parameter:", error)
      return {
        success: false,
        error: "Invalid or expired authorization request. Please try connecting again.",
        provider,
      }
    }

    const userId = stateData.userId
    if (!userId) {
      return {
        success: false,
        error: "User information not found in authorization request.",
        provider,
      }
    }

    // Get OAuth provider handler
    let oauthProvider
    try {
      oauthProvider = getOAuthProvider(provider)
    } catch (error: any) {
      console.error(`No OAuth provider found for ${provider}:`, error)
      return {
        success: false,
        error: `${provider} integration is not supported or configured.`,
        provider,
      }
    }

    // Exchange code for tokens
    let tokenData
    try {
      console.log(`🔑 Exchanging code for tokens with ${provider}`)
      tokenData = await oauthProvider.exchangeCodeForToken(code)

      if (!tokenData.access_token) {
        throw new Error("No access token received from provider")
      }
    } catch (error: any) {
      console.error(`Token exchange failed for ${provider}:`, error)

      let errorMessage = `Failed to complete authorization with ${provider}.`
      if (error.message?.includes("invalid_grant")) {
        errorMessage = "Authorization code expired. Please try connecting again."
      } else if (error.message?.includes("invalid_client")) {
        errorMessage = `${provider} integration is not properly configured.`
      }

      return {
        success: false,
        error: errorMessage,
        provider,
      }
    }

    // Get user info from provider
    let userInfo
    try {
      console.log(`👤 Fetching user info from ${provider}`)
      userInfo = await oauthProvider.getUserInfo(tokenData.access_token)

      if (!userInfo || (!userInfo.id && !userInfo.user_id && !userInfo.sub && !userInfo.login)) {
        throw new Error("No user ID received from provider")
      }
    } catch (error: any) {
      console.error(`Failed to get user info from ${provider}:`, error)
      return {
        success: false,
        error: `Failed to retrieve user information from ${provider}. Please try again.`,
        provider,
      }
    }

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
        reconnected: stateData.reconnect || false,
      },
    }

    // Save to database
    try {
      console.log(`💾 Saving integration data for ${provider}`)
      const supabase = createAdminSupabaseClient()
      if (!supabase) {
        throw new Error("Database connection failed")
      }

      await upsertIntegration(supabase, integrationData)

      // Log successful connection
      await supabase
        .from("token_audit_log")
        .insert({
          user_id: userId,
          provider,
          action: stateData.reconnect ? "reconnected" : "connected",
          status: "success",
          details: {
            scopes: integrationData.scopes,
            provider_user_id: integrationData.provider_user_id,
            token_expires_at: integrationData.expires_at,
          },
        })
        .catch((logError) => {
          console.warn("Failed to log successful connection:", logError)
        })

      console.log(`✅ Successfully connected ${provider} for user ${userId}`)

      return {
        success: true,
        message: `${provider} connected successfully`,
        provider,
      }
    } catch (error: any) {
      console.error(`Database error for ${provider}:`, error)
      return {
        success: false,
        error: `Failed to save ${provider} connection. Please try again.`,
        provider,
      }
    }
  } catch (error: any) {
    console.error(`Unexpected error in OAuth callback for ${provider}:`, error)

    // Log failed connection attempt
    try {
      const stateData = parseOAuthState(state)
      if (stateData.userId) {
        const supabase = createAdminSupabaseClient()
        if (supabase) {
          await supabase
            .from("token_audit_log")
            .insert({
              user_id: stateData.userId,
              provider,
              action: "connection_failed",
              status: "error",
              details: {
                error: error.message,
                timestamp: new Date().toISOString(),
              },
            })
            .catch((logError) => {
              console.warn("Failed to log connection failure:", logError)
            })
        }
      }
    } catch (logError) {
      console.warn("Failed to log error:", logError)
    }

    return {
      success: false,
      error: `An unexpected error occurred while connecting ${provider}. Please try again.`,
      provider,
    }
  }
}
