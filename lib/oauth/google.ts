import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { generateOAuthState } from "./utils"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class GoogleOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://accounts.google.com/o/oauth2/v2/auth"
  }

  static getRequiredScopes(): string[] {
    return [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid"
    ]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
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
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
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

  // Override the base class method to handle Google-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add Google-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("access_type", "offline")
    url.searchParams.append("prompt", "consent")
    url.searchParams.append("include_granted_scopes", "true")

    return url.toString()
  }

  // Override the base class method to handle Google-specific callback
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

      if (provider !== "google") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing Google OAuth configuration")
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
        throw new Error("No access token received from Google")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "google",
        provider_user_id: userData.sub,
        access_token,
        refresh_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=google_connected&provider=google`,
      }
    } catch (error: any) {
      console.error("Google OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }

  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing GOOGLE_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(provider: string): string {
    return "https://chainreact.app/api/integrations/google/callback"
  }

  static async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Google user info: ${response.statusText}`)
    }

    return response.json()
  }
}
