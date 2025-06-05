interface GoogleOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class GoogleOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    sessionAccessToken: string,
  ): Promise<GoogleOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (!provider || (!provider.startsWith("google") && provider !== "gmail" && provider !== "youtube")) {
        throw new Error("Invalid provider in state")
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: "https://chainreact.app/api/integrations/google/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope: grantedScope } = tokenData

      if (!access_token) {
        throw new Error("No access token received from Google")
      }

      // Validate scopes if required
      if (requireFullScopes) {
        const { OAuthService } = await import("./oauthService")
        const validation = await OAuthService.validateToken("google", access_token)

        if (!validation.valid) {
          console.error("Google scope validation failed:", validation)
          return {
            success: false,
            redirectUrl: `https://chainreact.app/integrations?error=insufficient_scopes&provider=google&message=${encodeURIComponent(
              `Your connection is missing required permissions: ${validation.missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes granted",
          }
        }
      }

      // Get user info from Google
      const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/json",
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const googleUserData = await userResponse.json()

      // Securely fetch the authenticated user using the session access token
      const { data: authenticatedUserData, error: userError } = await supabase.auth.getUser(sessionAccessToken)

      if (userError || !authenticatedUserData?.user) {
        throw new Error("User authentication failed")
      }

      const integrationData = {
        user_id: authenticatedUserData.user.id,
        provider: provider,
        provider_user_id: googleUserData.sub,
        status: "connected" as const,
        metadata: {
          access_token,
          refresh_token,
          expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
          user_name: googleUserData.name,
          user_email: googleUserData.email,
          picture: googleUserData.picture,
          scopes: grantedScope ? grantedScope.split(" ") : [],
          connected_at: new Date().toISOString(),
          validated_at: new Date().toISOString(),
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

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) {
          throw error
        }
      }

      return {
        success: true,
        redirectUrl: `https://chainreact.app/integrations?success=${provider}_connected&scopes_validated=true`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
