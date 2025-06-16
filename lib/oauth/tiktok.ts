import { BaseOAuthService, type OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class TikTokOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://www.tiktok.com/auth/authorize"
  }

  static getRequiredScopes(): string[] {
    return ["user.info.basic", "user.info.profile", "user.info.stats", "video.publish", "video.list"]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
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
    const response = await fetch("https://open.tiktokapis.com/v2/user/info/", {
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

  // Override the base class method to handle TikTok-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)

    // Add TikTok-specific parameters (client_key will be added server-side)
    const url = new URL(authUrl)
    url.searchParams.append("response_type", "code")
    url.searchParams.append("scope", this.getRequiredScopes().join(" "))

    return url.toString()
  }

  // Override the base class method to handle TikTok-specific callback
  static async handleCallback(provider: string, code: string, state: string, userId: string): Promise<OAuthResult> {
    try {
      // Create Supabase client
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      // Parse state
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (error) {
        console.error("Failed to parse state:", error)
        throw new Error("Invalid state format")
      }

      const { reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "tiktok") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials (server-side only)
      const clientKey = process.env.TIKTOK_CLIENT_KEY
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET

      if (!clientKey || !clientSecret) {
        throw new Error("Missing TikTok OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(provider),
        clientKey,
        clientSecret,
        stateData.codeVerifier,
      )

      const { access_token } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from TikTok")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "tiktok",
        provider_user_id: userData.data.user.open_id,
        access_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          username: userData.data.user.username,
          display_name: userData.data.user.display_name,
          avatar_url: userData.data.user.avatar_url,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=tiktok_connected&provider=tiktok`,
      }
    } catch (error: any) {
      console.error("TikTok OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=tiktok&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
