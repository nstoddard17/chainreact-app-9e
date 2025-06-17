import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, generateOAuthState, parseOAuthState, validateOAuthState, OAuthScopes } from "./utils"
import { createClient } from "@supabase/supabase-js"

interface InstagramOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class InstagramOAuthService {
  static clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  static clientSecret = process.env.INSTAGRAM_CLIENT_SECRET
  static apiUrl = "https://graph.instagram.com/v12.0"

  // Define required scopes for Instagram
  static getRequiredScopes() {
    return ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"]
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
      const response = await fetch(`https://graph.instagram.com/me?access_token=${accessToken}`)
      return response.ok
    } catch (error) {
      console.error("Instagram token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(userId: string): string {
    if (!this.clientId) {
      throw new Error("Missing Instagram client ID")
    }

    const state = generateOAuthState(userId, "instagram")
    const redirectUri = getOAuthRedirectUri("instagram")

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.INSTAGRAM.join(","),
      state,
    })

    return `https://api.instagram.com/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    return getOAuthRedirectUri(getBaseUrl(), "instagram")
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing Instagram OAuth configuration")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "instagram")

      const redirectUri = getOAuthRedirectUri("instagram")

      // Exchange code for token
      const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
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
      const userResponse = await fetch(`${this.apiUrl}/me?fields=id,username,account_type&access_token=${tokenData.access_token}`)

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
        .eq("provider", "instagram")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "instagram",
        provider_user_id: userData.id,
        access_token: tokenData.access_token,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(",") : [],
        metadata: {
          username: userData.username,
          account_type: userData.account_type,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=instagram_connected`,
      }
    } catch (error: any) {
      console.error("Instagram OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=instagram&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Instagram OAuth configuration")
    }

    const response = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
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
