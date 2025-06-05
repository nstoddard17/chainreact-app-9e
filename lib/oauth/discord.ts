import { upsertIntegration, parseOAuthState, getOAuthRedirectUri } from "./utils"

interface DiscordOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class DiscordOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Discord OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(userId: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = getOAuthRedirectUri("discord")

    // Updated required scopes for reading and writing messages
    const requiredScopes = ["identify", "guilds", "guilds.join", "messages.read"]

    const state = btoa(
      JSON.stringify({
        provider: "discord",
        userId,
        timestamp: Date.now(),
        reconnect,
        integrationId,
        requireFullScopes: true,
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: requiredScopes.join(" "),
      prompt: "consent", // Force re-authorization to ensure fresh scopes
      state,
    })

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`
  }

  static async validateToken(
    accessToken: string,
  ): Promise<{ valid: boolean; grantedScopes: string[]; missingScopes: string[] }> {
    try {
      // Test the token by making an API call to users/@me
      const response = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        return { valid: false, grantedScopes: [], missingScopes: [] }
      }

      // For Discord, we need to validate scopes from the stored integration data
      // since Discord doesn't provide scope info in the token endpoint
      return { valid: true, grantedScopes: [], missingScopes: [] }
    } catch (error) {
      console.error("Error validating Discord token:", error)
      return { valid: false, grantedScopes: [], missingScopes: [] }
    }
  }

  static async validateExistingIntegration(integration: any): Promise<boolean> {
    try {
      // Updated required scopes
      const requiredScopes = ["identify", "guilds", "guilds.join", "messages.read"]
      const grantedScopes = integration.configuration?.scopes || integration.scopes || []

      console.log("Discord scope validation:", { grantedScopes, requiredScopes })

      // Check if all required scopes are present
      const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

      if (missingScopes.length > 0) {
        console.log("Discord missing scopes:", missingScopes)
        return false
      }

      // Test the token by making an API call
      const accessToken = integration.credentials?.access_token || integration.access_token
      if (accessToken) {
        const response = await fetch("https://discord.com/api/users/@me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!response.ok) {
          console.log("Discord token validation failed:", response.status)
          return false
        }
      }

      return true
    } catch (error) {
      console.error("Discord validation error:", error)
      return false
    }
  }

  static async handleCallback(code: string, state: string, supabase: any, userId: string): Promise<DiscordOAuthResult> {
    try {
      const stateData = parseOAuthState(state)
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "discord") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = getOAuthRedirectUri("discord")

      console.log("Discord OAuth callback - using redirect URI:", redirectUri)

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Discord token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      // Validate scopes dynamically from the token response
      const grantedScopes = scope ? scope.split(" ") : []
      // Updated required scopes
      const requiredScopes = ["identify", "guilds", "guilds.join", "messages.read"]
      const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

      console.log("Discord OAuth - Granted scopes:", grantedScopes)
      console.log("Discord OAuth - Required scopes:", requiredScopes)
      console.log("Discord OAuth - Missing scopes:", missingScopes)

      if (missingScopes.length > 0) {
        console.error("Discord scope validation failed:", { grantedScopes, missingScopes })
        const baseUrl = "https://chainreact.app"
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=discord&message=${encodeURIComponent(
            `Your Discord connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all permissions.`,
          )}`,
          error: "Insufficient scopes",
        }
      }

      console.log("Discord scopes validated successfully:", grantedScopes)

      // Test the token by getting user info
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      // If this is a reconnect, clear any existing integration first
      if (reconnect || integrationId) {
        try {
          await supabase.from("advanced_integrations").delete().eq("user_id", userId).eq("provider", "discord")
          console.log("Cleared existing Discord integration for fresh connection")
        } catch (error) {
          console.warn("Failed to clear existing integration:", error)
        }
      }

      const integrationData = {
        user_id: userId,
        provider: "discord",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          username: userData.username,
          discriminator: userData.discriminator,
          avatar: userData.avatar,
          connected_at: new Date().toISOString(),
          scopes_validated: true,
          required_scopes: requiredScopes,
          granted_scopes: grantedScopes,
          token_type: tokenData.token_type,
          scope: scope, // Store original scope string
        },
      }

      // Use upsert to avoid duplicate key constraint violations
      await upsertIntegration(supabase, integrationData)

      const baseUrl = "https://chainreact.app"
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=discord_connected&provider=discord&scopes_validated=true`,
      }
    } catch (error: any) {
      console.error("Discord OAuth callback error:", error)
      const baseUrl = "https://chainreact.app"
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
