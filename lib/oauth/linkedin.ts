interface LinkedInOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class LinkedInOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing LinkedIn OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/linkedin/callback"

    // Use the correct LinkedIn v2 scopes
    const scopes = ["openid", "profile", "email", "w_member_social"]

    const state = btoa(
      JSON.stringify({
        provider: "linkedin",
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
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/linkedin/callback"
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<LinkedInOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "linkedin") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://chainreact.app/api/integrations/linkedin/callback",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        let errorMessage = `Token exchange failed: ${tokenResponse.status} - ${tokenResponse.statusText}`

        if (errorData && errorData.error_description) {
          errorMessage += ` - ${errorData.error}: ${errorData.error_description}`
        } else if (errorData && errorData.message) {
          errorMessage += ` - ${errorData.message}`
        }

        throw new Error(errorMessage)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      // Validate scopes if required
      if (requireFullScopes) {
        const grantedScopes: string[] = []

        try {
          // Test profile and email access with userinfo endpoint
          const userinfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: { Authorization: `Bearer ${access_token}` },
          })

          if (userinfoResponse.ok) {
            const userinfo = await userinfoResponse.json()
            if (userinfo.sub) grantedScopes.push("openid")
            if (userinfo.name || userinfo.given_name) grantedScopes.push("profile")
            if (userinfo.email) grantedScopes.push("email")
          }

          // Test posting capability
          const profileResponse = await fetch("https://api.linkedin.com/v2/people/~", {
            headers: { Authorization: `Bearer ${access_token}` },
          })

          if (profileResponse.ok || profileResponse.status === 403) {
            // 403 means we have the scope but specific permission denied
            grantedScopes.push("w_member_social")
          }

          const requiredScopes = ["openid", "profile", "email"]
          const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

          if (missingScopes.length > 0) {
            console.error("LinkedIn scope validation failed:", { grantedScopes, missingScopes })
            return {
              success: false,
              redirectUrl: `https://chainreact.app/integrations?error=insufficient_scopes&provider=linkedin&message=${encodeURIComponent(
                `Your connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
              )}`,
              error: "Insufficient scopes",
            }
          }
          console.log("LinkedIn scopes validated successfully:", grantedScopes)
        } catch (scopeError) {
          console.error("LinkedIn scope validation error:", scopeError)
          // Continue without failing if scope validation has issues
        }
      }

      const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.json()
        let errorMessage = `Failed to get user info: ${userResponse.status} - ${userResponse.statusText}`

        if (errorData && errorData.message) {
          errorMessage += ` - ${errorData.message}`
        }

        throw new Error(errorMessage)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "linkedin",
        provider_user_id: userData.sub,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["openid", "profile", "email", "w_member_social"],
        metadata: {
          first_name: userData.given_name,
          last_name: userData.family_name,
          email: userData.email,
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
        redirectUrl: `https://chainreact.app/integrations?success=linkedin_connected&provider=linkedin&scopes_validated=${requireFullScopes}`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=linkedin&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
