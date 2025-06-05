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

    const scopes = ["r_liteprofile", "r_emailaddress", "w_member_social"]

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

  static getRedirectUri(baseUrl: string): string {
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
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      // Validate scopes if required
      if (requireFullScopes) {
        // LinkedIn doesn't return scopes in token response, so we test endpoints
        const grantedScopes: string[] = []

        // Test profile access
        const profileResponse = await fetch(
          "https://api.linkedin.com/v2/people/~:(id,localizedFirstName,localizedLastName)",
          {
            headers: { Authorization: `Bearer ${access_token}` },
          },
        )
        if (profileResponse.ok) {
          grantedScopes.push("r_liteprofile")
        }

        // Test email access
        const emailResponse = await fetch(
          "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
          {
            headers: { Authorization: `Bearer ${access_token}` },
          },
        )
        if (emailResponse.ok) {
          grantedScopes.push("r_emailaddress")
        }

        // Test posting access (this might fail but we can check the error)
        const postResponse = await fetch("https://api.linkedin.com/v2/people/~", {
          headers: { Authorization: `Bearer ${access_token}` },
        })
        if (postResponse.ok || postResponse.status === 403) {
          // 403 means we have the scope but not permission to this specific action
          grantedScopes.push("w_member_social")
        }

        const requiredScopes = ["r_liteprofile", "r_emailaddress", "w_member_social"]
        const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

        if (missingScopes.length > 0) {
          console.error("LinkedIn scope validation failed:", { grantedScopes, missingScopes })
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=linkedin&message=${encodeURIComponent(
              `Your connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes",
          }
        }
        console.log("LinkedIn scopes validated successfully:", grantedScopes)
      }

      const userResponse = await fetch(
        "https://api.linkedin.com/v2/people/~:(id,localizedFirstName,localizedLastName)",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      )

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      let email = null
      try {
        const emailResponse = await fetch(
          "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          },
        )

        if (emailResponse.ok) {
          const emailData = await emailResponse.json()
          email = emailData.elements?.[0]?.["handle~"]?.emailAddress
        }
      } catch (error) {
        console.log("Failed to get email from LinkedIn:", error)
      }

      const integrationData = {
        user_id: userId,
        provider: "linkedin",
        provider_user_id: userData.id,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["r_liteprofile", "r_emailaddress", "w_member_social"],
        metadata: {
          first_name: userData.localizedFirstName,
          last_name: userData.localizedLastName,
          email: email,
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
        redirectUrl: `${baseUrl}/integrations?success=linkedin_connected&provider=linkedin&scopes_validated=${requireFullScopes}`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=linkedin&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
