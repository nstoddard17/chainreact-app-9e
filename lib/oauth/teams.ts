interface TeamsOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TeamsOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Teams OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<TeamsOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "teams") {
        throw new Error("Invalid provider in state")
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: "https://chainreact.app/api/integrations/teams/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      // Get user info from Microsoft Graph
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
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
        provider: "teams",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        status: "connected" as const,
        scopes: ["User.Read", "Chat.ReadWrite", "Team.ReadBasic.All"],
        metadata: {
          user_name: userData.displayName,
          user_email: userData.mail || userData.userPrincipalName,
          connected_at: new Date().toISOString(),
        },
      }

      if (reconnect && integrationId) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (updateError) {
          throw updateError
        }
      } else {
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)
        if (insertError) {
          throw insertError
        }
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=teams_connected&provider=teams`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
