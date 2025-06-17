import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, generateOAuthState, parseOAuthState, validateOAuthState, OAuthScopes } from "./utils"
import { createClient } from "@supabase/supabase-js"

interface TikTokOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TikTokOAuthService {
  static clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  static clientSecret = process.env.TIKTOK_CLIENT_SECRET
  static apiUrl = "https://open.tiktokapis.com/v2"

  // Define required scopes for TikTok
  static getRequiredScopes() {
    return ["user.info.basic", "video.upload", "video.list", "comment.list", "comment.create"]
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
  static async validateToken(accessToken: string, openId: string): Promise<boolean> {
    try {
      const response = await fetch("https://open-api.tiktok.com/user/info/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          access_token: accessToken,
          open_id: openId,
          fields: ["open_id", "union_id", "avatar_url", "display_name"],
        }),
      })
      return response.ok
    } catch (error) {
      console.error("TikTok token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(userId: string): string {
    if (!this.clientId) {
      throw new Error("Missing TikTok client ID")
    }

    const state = generateOAuthState(userId, "tiktok")
    const redirectUri = getOAuthRedirectUri("tiktok")

    const params = new URLSearchParams({
      client_key: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.TIKTOK.join(" "),
      state,
    })

    return `https://www.tiktok.com/auth/authorize/?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return getOAuthRedirectUri(baseUrl, "tiktok")
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing TikTok OAuth configuration")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "tiktok")

      const redirectUri = getOAuthRedirectUri("tiktok")

      // Exchange code for token
      const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user info
      const userResponse = await fetch(`${this.apiUrl}/user/info/`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        const error = await userResponse.text()
        throw new Error(`Failed to get user info: ${error}`)
      }

      const userData = await userResponse.json()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "tiktok")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "tiktok",
        provider_user_id: userData.data.user.open_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          username: userData.data.user.username,
          display_name: userData.data.user.display_name,
          avatar_url: userData.data.user.avatar_url,
          connected_at: now,
        },
        updated_at: now,
      }

      if (existingIntegration) {
        const { error } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: now,
        })

        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=tiktok_connected`,
      }
    } catch (error: any) {
      console.error("TikTok OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=tiktok&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing TikTok OAuth configuration")
    }

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }
}
