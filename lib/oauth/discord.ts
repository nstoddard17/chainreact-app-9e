import { upsertIntegration, parseOAuthState } from "./utils"

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

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)

    // Always include bot and applications.commands scopes
    const requiredScopes = ["bot", "applications.commands", "identify", "guilds"]

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: requiredScopes.join(" "),
    })

    if (reconnect) {
      params.append("prompt", "consent")
    }

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    // Hardcoded redirect URI
    return "https://chainreact.app/api/integrations/discord/callback"
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

      // Discord doesn't provide a way to get scopes from the token directly
      // We'll need to rely on what was stored during the OAuth flow
      return { valid: true, grantedScopes: [], missingScopes: [] }
    } catch (error) {
      console.error("Error validating Discord token:", error)
      return { valid: false, grantedScopes: [], missingScopes: [] }
    }
  }

  static async validateExistingIntegration(integration: any): Promise<boolean> {
    try {
      const requiredScopes = ["bot", "applications.commands", "identify", "guilds"]
      const grantedScopes = integration.scopes || []

      console.log("Discord scope validation:", { grantedScopes, requiredScopes })

      // Check if all required scopes are present
      const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

      if (missingScopes.length > 0) {
        console.log("Discord missing scopes:", missingScopes)
        return false
      }

      // Test the token by making an API call
      if (integration.access_token) {
        const response = await fetch("https://discord.com/api/users/@me", {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
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
      const redirectUri = this.getRedirectUri("")

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

      // Always validate scopes for Discord
      const grantedScopes = scope ? scope.split(" ") : []
      const requiredScopes = ["bot", "applications.commands", "identify", "guilds"]
      const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

      if (missingScopes.length > 0) {
        console.error("Discord scope validation failed:", { grantedScopes, missingScopes })
        const baseUrl = new URL(redirectUri).origin
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=discord&message=${encodeURIComponent(
            `Your Discord connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
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
        },
      }

      // Use upsert to avoid duplicate key constraint violations
      await upsertIntegration(supabase, integrationData)

      const baseUrl = new URL(redirectUri).origin
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
