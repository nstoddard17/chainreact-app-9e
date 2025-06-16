import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class YouTubeOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://accounts.google.com/o/oauth2/v2/auth"
  }

  static getRequiredScopes(): string[] {
    return [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload"
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
        client_id: clientId,
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
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  // Override the base class method to handle YouTube-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add YouTube-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("response_type", "code")
    url.searchParams.append("scope", this.getRequiredScopes().join(" "))
    url.searchParams.append("access_type", "offline")
    url.searchParams.append("prompt", "consent")

    return url.toString()
  }

  // Override the base class method to handle YouTube-specific callback
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

      if (provider !== "youtube") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing YouTube OAuth configuration")
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
        throw new Error("No access token received from YouTube")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)
      const channel = userData.items[0]

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "youtube",
        provider_user_id: channel.id,
        access_token,
        refresh_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          channel_id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnail_url: channel.snippet.thumbnails.default.url,
          subscriber_count: channel.statistics.subscriberCount,
          video_count: channel.statistics.videoCount,
          view_count: channel.statistics.viewCount,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=youtube_connected&provider=youtube`,
      }
    } catch (error: any) {
      console.error("YouTube OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=youtube&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}

// Export object for compatibility with index.ts
export const YouTubeOAuthService_Object = {
  generateAuthUrl: YouTubeOAuthService.generateAuthUrl.bind(YouTubeOAuthService),
  getRedirectUri: YouTubeOAuthService.getRedirectUri.bind(YouTubeOAuthService),
}
