interface TwitterOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TwitterOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Twitter OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/twitter/callback"

    const scopes = ["tweet.read", "tweet.write", "users.read", "offline.access"]

    const state = btoa(
      JSON.stringify({
        provider: "twitter",
        reconnect,
        integrationId,
        requireFullScopes: true,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: "challenge",
      code_challenge_method: "plain",
    })

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/twitter/callback"
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<TwitterOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "twitter") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(clientId + ":" + clientSecret).toString("base64")}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: "https://chainreact.app/api/integrations/twitter/callback",
          code_verifier: "challenge",
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
        const requiredScopes = ["tweet.read", "tweet.write", "users.read"]
        const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

        if (missingScopes.length > 0) {
          console.error("Twitter scope validation failed:", { grantedScopes, missingScopes })
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=twitter&message=${encodeURIComponent(
              `Your connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes",
          }
        }
        console.log("Twitter scopes validated successfully:", grantedScopes)
      }

      const userResponse = await fetch("https://api.twitter.com/2/users/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()
      const user = userData.data

      const integrationData = {
        user_id: userId,
        provider: "twitter",
        provider_user_id: user.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : [],
        metadata: {
          username: user.username,
          user_name: user.name,
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
        redirectUrl: `${baseUrl}/integrations?success=twitter_connected&provider=twitter&scopes_validated=${requireFullScopes}`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
