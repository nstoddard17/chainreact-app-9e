import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class PinterestOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://www.pinterest.com/oauth"
  }

  static getRequiredScopes(): string[] {
    return [
      "boards:read",
      "boards:write",
      "pins:read",
      "pins:write",
      "user_accounts:read"
    ]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scopes ? tokenResponse.scopes.split(",") : []
  }

  // Override the base class method to handle Pinterest-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add Pinterest-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("response_type", "code")
    url.searchParams.append("scope", this.getRequiredScopes().join(","))

    return url.toString()
  }

  // Override the base class method to handle Pinterest-specific callback
  static async handleCallback(
    provider: string,
    code: string,
    state: string,
    userId: string,
  ): Promise<OAuthResult> {
    try {
      // Create Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Parse state
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (error) {
        console.error("Failed to parse state:", error)
        throw new Error("Invalid state format")
      }

      const { reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "pinterest") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_PINTEREST_CLIENT_ID
      const clientSecret = process.env.PINTEREST_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing Pinterest OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(provider),
        clientId,
        clientSecret,
        stateData.codeVerifier
      )

      const { access_token } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from Pinterest")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "pinterest",
        provider_user_id: userData.username,
        access_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          username: userData.username,
          full_name: userData.full_name,
          about: userData.about,
          website_url: userData.website_url,
          connected_at: new Date().toISOString(),
          scopes_validated: requireFullScopes,
        },
      }

      // Update or insert integration
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
        redirectUrl: `${getBaseUrl()}/integrations?success=pinterest_connected&provider=pinterest`,
      }
    } catch (error: any) {
      console.error("Pinterest OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=pinterest&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
