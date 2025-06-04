interface AirtableTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope?: string
}

interface AirtableUserInfo {
  id: string
  name: string
  email: string
}

interface AirtableOAuthResult {
  success: boolean
  error?: string
  redirectUrl: string
}

export class AirtableOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Airtable OAuth credentials")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for Airtable
  static getRequiredScopes() {
    return ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write"]
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
      const response = await fetch("https://api.airtable.com/v0/meta/whoami", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      return response.ok
    } catch (error) {
      console.error("Airtable token validation error:", error)
      return false
    }
  }

  private static async exchangeCodeForToken(code: string, redirectUri: string): Promise<AirtableTokenResponse> {
    const { clientId, clientSecret } = this.getClientCredentials()

    const tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Airtable token exchange failed:", errorData)
      throw new Error(`Token exchange failed: ${tokenResponse.status}`)
    }

    return await tokenResponse.json()
  }

  private static async getUserInfo(accessToken: string): Promise<AirtableUserInfo> {
    const userResponse = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from Airtable:", errorData)
      throw new Error(`Failed to get user info: ${userResponse.status}`)
    }

    return await userResponse.json()
  }

  private static async saveIntegration(
    supabase: any,
    userId: string,
    tokenData: AirtableTokenResponse,
    userData: AirtableUserInfo,
    stateData: any,
    grantedScopes: string[],
  ): Promise<void> {
    const integrationData = {
      user_id: userId,
      provider: "airtable",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: grantedScopes,
      metadata: {
        user_name: userData.name,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: userId,
      provider: "airtable",
      reconnect: stateData.reconnect,
      integrationId: stateData.integrationId,
    })

    if (stateData.reconnect && stateData.integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stateData.integrationId)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }
  }

  public static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/airtable/callback"
  }

  public static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<AirtableOAuthResult> {
    try {
      console.log("Airtable OAuth callback:", { code: !!code, state })

      if (!code || !state) {
        console.error("Missing code or state in Airtable callback")
        return {
          success: false,
          error: "missing_params",
          redirectUrl: `${baseUrl}/integrations?error=missing_params&provider=airtable`,
        }
      }

      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      console.log("Decoded state data:", stateData)

      if (provider !== "airtable") {
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

      // Get secure redirect URI
      const redirectUri = this.getRedirectUri()
      console.log("Using redirect URI:", redirectUri)

      // Exchange code for access token
      console.log("Exchanging code for access token...")
      const tokenData = await this.exchangeCodeForToken(code, redirectUri)
      console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })

      // Get granted scopes from the token data
      const grantedScopes = tokenData.scope
        ? tokenData.scope.split(" ")
        : ["data.records:read", "data.records:write", "schema.bases:read"]

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=airtable&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(tokenData.access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=airtable`,
        }
      }

      // Get user info from Airtable
      console.log("Fetching user info from Airtable...")
      const userData = await this.getUserInfo(tokenData.access_token)
      console.log("User info fetched successfully:", { userId: userData.id })

      // Save integration to database
      await this.saveIntegration(supabase, userId, tokenData, userData, stateData, grantedScopes)

      console.log("Airtable integration saved successfully")
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=airtable_connected`,
      }
    } catch (error: any) {
      console.error("Airtable OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=airtable&message=${encodeURIComponent(error.message)}`,
      }
    }
  }

  public static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const state = btoa(
      JSON.stringify({
        provider: "airtable",
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: "data.records:read data.records:write schema.bases:read schema.bases:write",
    })

    return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
  }
}
