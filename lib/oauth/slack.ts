interface SlackTokenResponse {
  ok: boolean
  access_token?: string
  token_type?: string
  scope?: string
  team?: any
  authed_user?: any
  bot_user_id?: string
  error?: string
}

interface SlackOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class SlackOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Slack OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<SlackOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, requireFullScopes } = stateData

      if (provider !== "slack") {
        throw new Error("Invalid provider in state")
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: "https://chainreact.app/api/integrations/slack/callback",
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.statusText}`)
      }

      const tokenData: SlackTokenResponse = await tokenResponse.json()

      if (!tokenData.ok) {
        throw new Error(tokenData.error || "Token exchange failed")
      }

      // Validate that we have the required scopes, especially files:write and reactions:write
      const requiredScopes = [
        "chat:write",
        "chat:write.public",
        "channels:read",
        "channels:join",
        "groups:read",
        "im:read",
        "users:read",
        "team:read",
        "files:write",
        "reactions:write",
      ]

      const grantedScopes = tokenData.scope ? tokenData.scope.split(",") : []
      const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

      if (missingScopes.length > 0) {
        console.error("Missing required Slack scopes:", missingScopes)
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=slack&message=${encodeURIComponent(
            `Your Slack connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
          )}`,
          error: "Insufficient scopes granted",
        }
      }

      // Validate token by making an API call
      if (tokenData.access_token) {
        try {
          const authTestResponse = await fetch("https://slack.com/api/auth.test", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              "Content-Type": "application/json",
            },
          })

          const authTestData = await authTestResponse.json()

          if (!authTestData.ok) {
            throw new Error(`Token validation failed: ${authTestData.error}`)
          }

          console.log("Slack token validated successfully:", authTestData.team, authTestData.user)
        } catch (error) {
          console.error("Slack token validation failed:", error)
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=token_validation&provider=slack&message=${encodeURIComponent(
              "Failed to validate Slack token. Please try reconnecting.",
            )}`,
            error: "Token validation failed",
          }
        }
      }

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "slack",
        provider_user_id: tokenData.authed_user?.id || "unknown",
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          access_token: tokenData.access_token,
          token_type: tokenData.token_type || "bot",
          scope: tokenData.scope,
          team: tokenData.team,
          authed_user: tokenData.authed_user,
          bot_user_id: tokenData.bot_user_id,
          connected_at: new Date().toISOString(),
          validated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Check if integration already exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "slack")
        .single()

      let result
      if (existingIntegration) {
        // Always update the token and scopes for existing integrations
        result = await supabase
          .from("integrations")
          .update({
            status: "connected",
            provider_user_id: integrationData.provider_user_id,
            scopes: integrationData.scopes,
            metadata: integrationData.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingIntegration.id)
          .select()
      } else {
        result = await supabase.from("integrations").insert(integrationData).select()
      }

      if (result.error) {
        throw new Error(`Database error: ${result.error.message}`)
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=${existingIntegration ? "slack_reconnected" : "slack_connected"}&provider=slack&scopes_validated=true`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&message=${encodeURIComponent(error.message)}&provider=slack`,
        error: error.message,
      }
    }
  }
}
