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

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<DiscordOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "discord") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

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
          redirect_uri: "https://chainreact.app/api/integrations/discord/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      // Validate scopes if required
      if (requireFullScopes) {
        const grantedScopes = scope ? scope.split(" ") : []
        const requiredScopes = ["bot", "applications.commands"]
        const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

        if (missingScopes.length > 0) {
          console.error("Discord scope validation failed:", { grantedScopes, missingScopes })
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=discord&message=${encodeURIComponent(
              `Your connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes",
          }
        }
        console.log("Discord scopes validated successfully:", grantedScopes)
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

      const integrationData = {
        user_id: userId,
        provider: "discord",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : [],
        metadata: {
          username: userData.username,
          discriminator: userData.discriminator,
          avatar: userData.avatar,
          connected_at: new Date().toISOString(),
          scopes_validated: requireFullScopes,
        },
      }

      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=discord_connected&provider=discord&scopes_validated=${requireFullScopes}`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
