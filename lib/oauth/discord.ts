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

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/discord/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

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
      prompt: "consent",
      state,
    })

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`
  }

  static async validateToken(
    accessToken: string,
  ): Promise<{ valid: boolean; grantedScopes: string[]; missingScopes: string[] }> {
    try {
      const response = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        return { valid: false, grantedScopes: [], missingScopes: [] }
      }

      return { valid: true, grantedScopes: [], missingScopes: [] }
    } catch (error) {
      console.error("Error validating Discord token:", error)
      return { valid: false, grantedScopes: [], missingScopes: [] }
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
      const redirectUri = this.getRedirectUri()

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

      const grantedScopes = scope ? scope.split(" ") : []
      const requiredScopes = ["identify", "guilds", "guilds.join", "messages.read"]

      const hasIdentify = grantedScopes.includes("identify")

      if (!hasIdentify) {
        console.error("Discord scope validation failed: missing identify scope")
        return {
          success: false,
          redirectUrl: `https://chainreact.app/integrations?error=insufficient_scopes&provider=discord&message=${encodeURIComponent(
            "Your Discord connection is missing the 'identify' permission. Please reconnect and accept all permissions.",
          )}`,
          error: "Insufficient scopes",
        }
      }

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

      if (reconnect || integrationId) {
        try {
          await supabase.from("integrations").delete().eq("user_id", userId).eq("provider", "discord")
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
          scope: scope,
          user_id: userData.id,
          global_name: userData.global_name,
        },
      }

      const savedIntegration = await upsertIntegration(supabase, integrationData)
      console.log("Discord integration saved successfully:", savedIntegration)

      return {
        success: true,
        redirectUrl: `https://chainreact.app/integrations?success=discord_connected&provider=discord`,
      }
    } catch (error: any) {
      console.error("Discord OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
