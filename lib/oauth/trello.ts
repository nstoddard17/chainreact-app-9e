interface TrelloOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TrelloOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
    const clientSecret = process.env.TRELLO_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Trello OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for Trello
  static getRequiredScopes() {
    return ["read", "write", "account"]
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
  static async validateToken(token: string, clientId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.trello.com/1/members/me?key=${clientId}&token=${token}`)
      return response.ok
    } catch (error) {
      console.error("Trello token validation error:", error)
      return false
    }
  }

  static async handleCallback(
    token: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<TrelloOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, scopes } = stateData

      if (provider !== "trello") {
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

      const { clientId } = this.getClientCredentials()

      // Get granted scopes from the state (Trello doesn't return scopes in token response)
      const grantedScopes = scopes || ["read", "write"]

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=trello&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(token, clientId)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=trello`,
        }
      }

      // Get user info from Trello
      const userResponse = await fetch(`https://api.trello.com/1/members/me?key=${clientId}&token=${token}`)

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        throw new Error(`Failed to get user info: ${userResponse.status}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "trello",
        provider_user_id: userData.id,
        access_token: token,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          user_name: userData.fullName,
          username: userData.username,
          user_email: userData.email,
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

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=trello_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
