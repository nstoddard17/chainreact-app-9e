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

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_AIRTABLE_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing AIRTABLE_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  // Enhanced scopes for comprehensive Airtable functionality
  static getRequiredScopes() {
    return [
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "schema.bases:write",
      "data.recordComments:read",
      "data.recordComments:write",
      "webhook:manage",
    ]
  }

  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

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

  private static async exchangeCodeForToken(code: string): Promise<AirtableTokenResponse> {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/airtable/callback"

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
    if (!userId) {
      throw new Error("User ID is required")
    }

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

    if (stateData.reconnect && stateData.integrationId) {
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stateData.integrationId)

      if (error) {
        throw error
      }
    } else {
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        throw error
      }
    }
  }

  public static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/airtable/callback"
  }

  public static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
  ): Promise<AirtableOAuthResult> {
    try {
      if (!code) {
        throw new Error("Missing authorization code from Airtable")
      }

      if (!state) {
        throw new Error("Missing state parameter from Airtable")
      }

      if (!userId) {
        throw new Error("User ID is required")
      }

      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "airtable") {
        throw new Error("Invalid provider in state")
      }

      const tokenData = await this.exchangeCodeForToken(code)

      const grantedScopes = tokenData.scope
        ? tokenData.scope.split(" ")
        : ["data.records:read", "data.records:write", "schema.bases:read"]

      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `https://chainreact.app/integrations?error=insufficient_scopes&provider=airtable&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      const isTokenValid = await this.validateToken(tokenData.access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `https://chainreact.app/integrations?error=invalid_token&provider=airtable`,
        }
      }

      const userData = await this.getUserInfo(tokenData.access_token)
      await this.saveIntegration(supabase, userId, tokenData, userData, stateData, grantedScopes)

      return {
        success: true,
        redirectUrl: `https://chainreact.app/integrations?success=airtable_connected`,
      }
    } catch (error: any) {
      console.error("Airtable OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=airtable&message=${encodeURIComponent(error.message)}`,
      }
    }
  }

  public static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!userId) {
      throw new Error("User ID is required for Airtable OAuth")
    }

    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/airtable/callback"

    const state = btoa(
      JSON.stringify({
        provider: "airtable",
        userId,
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
      scope:
        "data.records:read data.records:write schema.bases:read schema.bases:write data.recordComments:read data.recordComments:write webhook:manage",
    })

    return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
  }
}
