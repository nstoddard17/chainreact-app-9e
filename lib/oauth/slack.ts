import { getOAuthRedirectUri, upsertIntegration, parseOAuthState } from "./utils"

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

  static async validateToken(accessToken: string): Promise<{ valid: boolean; grantedScopes: string[] }> {
    try {
      const response = await fetch("https://slack.com/api/auth.test", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const data = await response.json()
      return {
        valid: data.ok === true,
        grantedScopes: [], // Slack doesn't return scopes in auth.test
      }
    } catch (error) {
      console.error("Error validating Slack token:", error)
      return { valid: false, grantedScopes: [] }
    }
  }

  static async validateExistingIntegration(integration: any): Promise<boolean> {
    try {
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
      const grantedScopes = integration.scopes || []

      console.log("Slack scope validation:", { grantedScopes, requiredScopes })

      // Check if all required scopes are present
      const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

      if (missingScopes.length > 0) {
        console.log("Slack missing scopes:", missingScopes)
        return false
      }

      // Test the token
      if (integration.access_token) {
        const validation = await this.validateToken(integration.access_token)
        return validation.valid
      }

      return true
    } catch (error) {
      console.error("Slack validation error:", error)
      return false
    }
  }

  static async handleCallback(code: string, state: string, supabase: any, userId: string): Promise<SlackOAuthResult> {
    try {
      const stateData = parseOAuthState(state)
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "slack") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = getOAuthRedirectUri("slack")

      console.log("Slack OAuth callback - using redirect URI:", redirectUri)

      const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Slack token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()

      if (!tokenData.ok) {
        throw new Error(`Slack OAuth error: ${tokenData.error}`)
      }

      const { access_token, scope, team, authed_user } = tokenData

      // Validate scopes
      const grantedScopes = scope ? scope.split(",") : []
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
      const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

      if (missingScopes.length > 0) {
        console.error("Slack scope validation failed:", { grantedScopes, missingScopes })
        const baseUrl = new URL(redirectUri).origin
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=slack&message=${encodeURIComponent(
            `Your Slack connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
          )}`,
          error: "Insufficient scopes",
        }
      }

      console.log("Slack scopes validated successfully:", grantedScopes)

      const integrationData = {
        user_id: userId,
        provider: "slack",
        provider_user_id: authed_user?.id,
        access_token,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          team_id: team?.id,
          team_name: team?.name,
          user_id: authed_user?.id,
          connected_at: new Date().toISOString(),
          scopes_validated: true,
          required_scopes: requiredScopes,
          granted_scopes: grantedScopes,
        },
      }

      // Use upsert to avoid duplicate key constraint violations
      await upsertIntegration(supabase, integrationData)

      const baseUrl = new URL(redirectUri).origin
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=slack_connected&provider=slack&scopes_validated=true`,
      }
    } catch (error: any) {
      console.error("Slack OAuth callback error:", error)
      const baseUrl = getOAuthRedirectUri("slack").split("/api")[0]
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=slack&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
