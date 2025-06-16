import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class TumblrOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://www.tumblr.com/oauth2/authorize"
  }

  static getRequiredScopes(): string[] {
    return [
      "basic",
      "write",
      "offline_access"
    ]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://api.tumblr.com/v2/oauth2/token", {
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
    const response = await fetch("https://api.tumblr.com/v2/user/info", {
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
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  // Override the base class method to handle Tumblr-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add Tumblr-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("response_type", "code")
    url.searchParams.append("scope", this.getRequiredScopes().join(" "))

    return url.toString()
  }

  // Override the base class method to handle Tumblr-specific callback
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

      if (provider !== "tumblr") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_TUMBLR_CLIENT_ID
      const clientSecret = process.env.TUMBLR_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing Tumblr OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(provider),
        clientId,
        clientSecret,
        stateData.codeVerifier
      )

      const { access_token, refresh_token } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from Tumblr")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)
      const user = userData.response.user

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "tumblr",
        provider_user_id: user.name,
        access_token,
        refresh_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          name: user.name,
          blogs: user.blogs,
          following: user.following,
          likes: user.likes,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=tumblr_connected&provider=tumblr`,
      }
    } catch (error: any) {
      console.error("Tumblr OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=tumblr&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
} 