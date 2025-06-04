interface HubSpotOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class HubSpotOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing HubSpot OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for HubSpot
  static getRequiredScopes() {
    return [
      "contacts",
      "content",
      "forms",
      "tickets",
      "e-commerce",
      "automation",
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
    ]
  }

  // Validate scopes against required scopes
  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  // Validate token by making an API call
  static async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      return response.ok
    } catch (error) {
      console.error("HubSpot token validation error:", error)
      return false
    }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<HubSpotOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "hubspot") {
        throw new Error("Invalid provider in state")
      }

      // Clear any existing tokens before requesting new ones
      if (reconnect && integrationId) {
        const { error: clearError } = await supabase
          .from("integrations")
          .update({
            access_token: null,
            refresh_token: null,
            status: "reconnecting",
          })
          .eq("id", integrationId)

        if (clearError) {
          console.error("Error clearing existing tokens:", clearError)
        }
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: "https://chainreact.app/api/integrations/hubspot/callback",
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      // Get granted scopes from the token data
      const grantedScopes = scope ? scope.split(" ") : []

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=hubspot&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=hubspot`,
        }
      }

      // Get user info from HubSpot
      const userResponse = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + access_token)

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "hubspot",
        provider_user_id: userData.user_id.toString(),
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          hub_domain: userData.hub_domain,
          hub_id: userData.hub_id,
          user_id: userData.user_id,
          connected_at: new Date().toISOString(),
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
        redirectUrl: `${baseUrl}/integrations?success=hubspot_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=hubspot&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
